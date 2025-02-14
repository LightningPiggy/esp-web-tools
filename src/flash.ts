import { Transport, ESPLoader } from "esptool-js";
import {
  Build,
  FlashError,
  FlashState,
  Manifest,
  FlashStateType,
} from "./const";
import { sleep } from "./util/sleep";

import { Buffer }  from 'buffer';

async function findAndReplaceInFirmware(firmwareBuffer:string, findString:string, replaceString:string) {
  console.log("firmwareBuffer.length is " + firmwareBuffer.length + ", findString.length is " + findString.length + " and replaceString.length is " + replaceString.length);
  replaceString = replaceString.padEnd(findString.length, '\u0000');
  console.log("after padding, replaceString.length is " + replaceString.length);
  let stringBuffer = firmwareBuffer.replace(findString, replaceString);
  console.log("after replacing, stringBuffer.length is " + stringBuffer.length);
  let replacedBuffer = Buffer.from(stringBuffer, 'binary');
  console.log("after Buffer.from, replacedBuffer.length is " + replacedBuffer.length);
  replacedBuffer = await fixFirmwareChecksums(replacedBuffer);
  console.log("after fixFirmwareChecksums, replacedBuffer.length is " + replacedBuffer.length);
  let string_to_return = replacedBuffer.toString('binary');
  console.log("after toString(), string_to_return.length is " + string_to_return.length);
  return string_to_return;
};

// fixFirmwareChecksums: given a firmware, fix the checksums
async function fixFirmwareChecksums(toReplace:Buffer) {
	console.log("fixFirmwareChecksums");
        let bufferSize = toReplace.length
        console.log("Read " + bufferSize + " bytes from file\n");

        let newFirmware = Buffer.alloc(bufferSize);
        let newFirmwarePosition = 0;

        // PARSE HEADER
        // first 8+16 bytes are the header
        let nrOfSegments = toReplace.readInt8(1);
        console.log("Number of Segments: " + nrOfSegments);
	// disable sha256:
	toReplace[8+15] = 0;
        let shaChecksum = toReplace.readInt8(8+15);
        console.log("Firmware has SHA checksum: " + shaChecksum);
        // Copy header to new firmware:
        toReplace.slice(0,8+16).copy(newFirmware);
        newFirmwarePosition += 8+16;

        // READ SEGMENTS
        let xorChecksum = 0xEF;
        let segmentstart = 8+16;
        for (let segment=0 ; segment<nrOfSegments ; segment++) {
                console.log("\nParsing segment " + segment);

                let memOffset = toReplace.readInt32LE(segmentstart);
                console.log("Memory Offset = " + memOffset);

                let size = toReplace.readInt32LE(segmentstart+4);
                console.log("Size = " + size);
                let segmentEnd = segmentstart+8+size;
                //console.log("End of segment: " + segmentEnd)

                // Copy segment to new firmware:
                toReplace.slice(segmentstart,segmentEnd).copy(newFirmware,newFirmwarePosition);
                newFirmwarePosition = segmentEnd;
                // Exclude header from segment
                xorChecksum = updateChecksum(toReplace.slice(segmentstart+8,segmentEnd), xorChecksum);

                // Move forward in buffer
                segmentstart = segmentEnd
        }

        // BUILD FOOTER
        //console.log("Reading footer:"); console.log(toReplace.slice(segmentstart))

        // Calculate length with padding to multiple of 16
        let targetLength = (Math.floor(newFirmwarePosition/16) + 1)*16;

        // Pad new firmware to targetLength (- 1 for checksum)
        Buffer.alloc(targetLength-1-newFirmwarePosition, 0x00).copy(newFirmware,newFirmwarePosition);
        newFirmwarePosition = targetLength-1; // Leave 1 byte for the checksum

        // Add XOR checksum
        console.log("\nAdding XOR checksum: " + xorChecksum.toString(16) + "\n");
        newFirmware[targetLength-1] = xorChecksum;
        newFirmwarePosition = targetLength;

        // Add SHA256 checksum
        if (shaChecksum == 1) {
		console.log("WARNING: Adding SHA256 checksum is not needed and not supported!");
        } else {
		console.log("Not adding sha256 checksum because there was none in the original file. This is normal.");
	}

        return newFirmware;
}



function updateChecksum(buffer:Buffer, startValue:number) {
        let xorChecksum = startValue;
        for (let start=0;start<buffer.length;start++) {
                xorChecksum = xorChecksum ^ buffer.readInt8(start);
        }
        return xorChecksum;
}



const resetTransport = async (transport: Transport) => {
  await transport.device.setSignals({
    dataTerminalReady: false,
    requestToSend: true,
  });
  await transport.device.setSignals({
    dataTerminalReady: false,
    requestToSend: false,
  });
};

export const flash = async (
  onEvent: (state: FlashState) => void,
  port: SerialPort,
  manifestPath: string,
  manifest: Manifest,
  eraseFirst: boolean
) => {
  let build: Build | undefined;
  let chipFamily: Build["chipFamily"];

  const fireStateEvent = (stateUpdate: FlashState) =>
    onEvent({
      ...stateUpdate,
      manifest,
      build,
      chipFamily,
    });

  const transport = new Transport(port);
  const esploader = new ESPLoader(transport, 115200, undefined);

  // For debugging
  (window as any).esploader = esploader;

  fireStateEvent({
    state: FlashStateType.INITIALIZING,
    message: "Initializing...",
    details: { done: false },
  });

  try {
    await esploader.main_fn();
    await esploader.flash_id();
  } catch (err: any) {
    console.error(err);
    fireStateEvent({
      state: FlashStateType.ERROR,
      message:
        "Failed to initialize. Try resetting your device or holding the BOOT button while clicking INSTALL.",
      details: { error: FlashError.FAILED_INITIALIZING, details: err },
    });
    await resetTransport(transport);
    await transport.disconnect();
    return;
  }

  chipFamily = esploader.chip.CHIP_NAME as any;

  if (!esploader.chip.ROM_TEXT) {
    fireStateEvent({
      state: FlashStateType.ERROR,
      message: `Chip ${chipFamily} is not supported`,
      details: {
        error: FlashError.NOT_SUPPORTED,
        details: `Chip ${chipFamily} is not supported`,
      },
    });
    await resetTransport(transport);
    await transport.disconnect();
    return;
  }

  fireStateEvent({
    state: FlashStateType.INITIALIZING,
    message: `Initialized. Found ${chipFamily}`,
    details: { done: true },
  });

  build = manifest.builds.find((b) => b.chipFamily === chipFamily);

  if (!build) {
    fireStateEvent({
      state: FlashStateType.ERROR,
      message: `Your ${chipFamily} board is not supported.`,
      details: { error: FlashError.NOT_SUPPORTED, details: chipFamily },
    });
    await resetTransport(transport);
    await transport.disconnect();
    return;
  }

  fireStateEvent({
    state: FlashStateType.PREPARING,
    message: "Preparing installation...",
    details: { done: false },
  });

  const manifestURL = new URL(manifestPath, location.toString()).toString();
  const filePromises = build.parts.map(async (part) => {
    const url = new URL(part.path, manifestURL).toString();
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(
        `Downlading firmware ${part.path} failed: ${resp.status}`
      );
    }

    const reader = new FileReader();
    const blob = await resp.blob();

    return new Promise<string>((resolve) => {
      reader.addEventListener("load", () => resolve(reader.result as string));
      reader.readAsBinaryString(blob);
    });
  });

  const fileArray: Array<{ data: string; address: number }> = [];
  let totalSize = 0;

  for (let part = 0; part < filePromises.length; part++) {
    try {
      let data = await filePromises[part];
      if (part == 3) {
	console.log("Customizing part 3 of length " + data.length + " bytes.");

	const wifissid = (document.getElementById('wifissid') as HTMLInputElement)?.value;
        const wifikey = (document.getElementById('wifikey') as HTMLInputElement)?.value;
        const lnbitshost = (document.getElementById('lnbitshost') as HTMLInputElement)?.value;
        const lnbitskey = (document.getElementById('lnbitskey') as HTMLInputElement)?.value;

        //if (!wifissid || !wifikey || !lnbitshost || !lnbitskey) throw new Error('ERROR: empty wifissid, wifikey, lnbitshost or lnbitskey are not supported for the configuration!');

        const fiatcurrency = (document.getElementById('fiatcurrency') as HTMLInputElement)?.value;
        const timezone = (document.getElementById('timezone') as HTMLInputElement)?.value;
        const locale = (document.getElementById('locale') as HTMLInputElement)?.value;
        const thousands = (document.getElementById('thousands') as HTMLInputElement)?.value;
        const decimals = (document.getElementById('decimals') as HTMLInputElement)?.value;
        const bootsloganprelude = (document.getElementById('bootsloganprelude') as HTMLInputElement)?.value;
        const showbootslogan = (document.getElementById('showbootslogan') as HTMLInputElement)?.value;
        const staticlnurlp = (document.getElementById('staticlnurlp') as HTMLInputElement)?.value;
        const balancebias = (document.getElementById('balancebias') as HTMLInputElement)?.value;
        const lnbitsport = (document.getElementById('lnbitsport') as HTMLInputElement)?.value;

	data = await findAndReplaceInFirmware(data, "REPLACETHISBYWIFISSID_REPLACETHISBYWIFISSID_REPLACETHISBYWIFISSID", wifissid);
	data = await findAndReplaceInFirmware(data, "REPLACETHISBYWIFIKEY_REPLACETHISBYWIFIKEY_REPLACETHISBYWIFIKEY", wifikey);
	data = await findAndReplaceInFirmware(data, "REPLACETHISBYLNBITSHOST_REPLACETHISBYLNBITSHOST_REPLACETHISBYLNBITSHOST", lnbitshost);
	data = await findAndReplaceInFirmware(data, "REPLACETHISBYLNBITSKEY_REPLACETHISBYLNBITSKEY_REPLACETHISBYLNBITSKEY", lnbitskey);

	data = await findAndReplaceInFirmware(data, "REPLACETHISBYFIATCURRENCY_REPLACETHISBYFIATCURRENCY_REPLACETHISBYFIATCURRENCY", fiatcurrency);
	data = await findAndReplaceInFirmware(data, "REPLACETHISBYTIMEZONE_REPLACETHISBYTIMEZONE_REPLACETHISBYTIMEZONE", timezone);
	data = await findAndReplaceInFirmware(data, "REPLACETHISBYLOCALE_REPLACETHISBYLOCALE_REPLACETHISBYLOCALE", locale);
	data = await findAndReplaceInFirmware(data, "REPLACETHISBYTHOUSANDSSEPARATOR_REPLACETHISBYTHOUSANDSSEPARATOR_REPLACETHISBYTHOUSANDSSEPARATOR", thousands);
	data = await findAndReplaceInFirmware(data, "REPLACETHISBYDECIMALSEPARATOR_REPLACETHISBYDECIMALSEPARATOR_REPLACETHISBYDECIMALSEPARATOR", decimals);
	data = await findAndReplaceInFirmware(data, "REPLACETHISBYBOOTSLOGANPRELUDE_REPLACETHISBYBOOTSLOGANPRELUDE_REPLACETHISBYBOOTSLOGANPRELUDE", bootsloganprelude);
	data = await findAndReplaceInFirmware(data, "REPLACETHISBYSHOWBOOTSLOGAN_REPLACETHISBYSHOWBOOTSLOGAN_REPLACETHISBYSHOWBOOTSLOGAN", showbootslogan);
	data = await findAndReplaceInFirmware(data, "REPLACETHISBYSTATICLNURLPAYMENTSVALUESTRING_REPLACETHISBYSTATICLNURLPAYMENTSVALUESTRING_REPLACETHISBYSTATICLNURLPAYMENTSVALUESTRING", staticlnurlp);
	data = await findAndReplaceInFirmware(data, "REPLACETHISBYBALANCEBIAS_REPLACETHISBYBALANCEBIAS_REPLACETHISBYBALANCEBIAS", balancebias);
	data = await findAndReplaceInFirmware(data, "REPLACETHISBYLNBITSPORT_REPLACETHISBYLNBITSPORT_REPLACETHISBYLNBITSPORT", lnbitsport);

	console.log("Firmware length after customization (should match before): " + data.length + " bytes.");
	// Dump it to the console for inspection:
	var encodedStringBtoA = btoa(data);
	console.log(encodedStringBtoA);
      } else {
	console.log("Not customizing firmware part " + part);
      }
      fileArray.push({ data, address: build.parts[part].offset });
      totalSize += data.length;
    } catch (err: any) {
      console.error("Firmware customization got error:");
      console.error(err);
      fireStateEvent({
        state: FlashStateType.ERROR,
        message: err.message,
        details: {
          error: FlashError.FAILED_FIRMWARE_DOWNLOAD,
          details: err.message,
        },
      });
      await resetTransport(transport);
      await transport.disconnect();
      return;
    }
  }

  fireStateEvent({
    state: FlashStateType.PREPARING,
    message: "Installation prepared",
    details: { done: true },
  });

  if (eraseFirst) {
    fireStateEvent({
      state: FlashStateType.ERASING,
      message: "Erasing device...",
      details: { done: false },
    });
    await esploader.erase_flash();
    fireStateEvent({
      state: FlashStateType.ERASING,
      message: "Device erased",
      details: { done: true },
    });
  }

  fireStateEvent({
    state: FlashStateType.WRITING,
    message: `Writing progress: 0%`,
    details: {
      bytesTotal: totalSize,
      bytesWritten: 0,
      percentage: 0,
    },
  });

  let totalWritten = 0;

  try {
    await esploader.write_flash(
      fileArray,
      "keep",
      "keep",
      "keep",
      false,
      true,
      // report progress
      (fileIndex: number, written: number, total: number) => {
        const uncompressedWritten =
          (written / total) * fileArray[fileIndex].data.length;

        const newPct = Math.floor(
          ((totalWritten + uncompressedWritten) / totalSize) * 100
        );

        // we're done with this file
        if (written === total) {
          totalWritten += uncompressedWritten;
          return;
        }

        fireStateEvent({
          state: FlashStateType.WRITING,
          message: `Writing progress: ${newPct}%`,
          details: {
            bytesTotal: totalSize,
            bytesWritten: totalWritten + written,
            percentage: newPct,
          },
        });
      }
    );
  } catch (err: any) {
    console.error("Firmware write failed:");
    console.error(err);
    fireStateEvent({
      state: FlashStateType.ERROR,
      message: err.message,
      details: { error: FlashError.WRITE_FAILED, details: err },
    });
    await resetTransport(transport);
    await transport.disconnect();
    return;
  }

  fireStateEvent({
    state: FlashStateType.WRITING,
    message: "Writing complete",
    details: {
      bytesTotal: totalSize,
      bytesWritten: totalWritten,
      percentage: 100,
    },
  });

  await sleep(100);
  console.log("HARD RESET");
  await resetTransport(transport);
  console.log("DISCONNECT");
  await transport.disconnect();

  fireStateEvent({
    state: FlashStateType.FINISHED,
    message: "All done!",
  });
};
