#target=/home/user/wip-LightningPiggy/sources/lightningpiggy.github.io/
target=/home/user/projects/wip-LightningPiggy/sources/lightningpiggy.github.io/

mkdir -p "$target"/dist/webumd/
cp dist/webumd/install-button.js "$target"/dist/webumd/

cp index.html "$target"

cp -R static "$target"
cp -R manifests "$target"
cp -R firmware "$target"

#for fwfile in bootloader_qio_80m.bin boot_app0.bin LightningPiggy-Lilygo-266.ino.partitions.bin LightningPiggy-Lilygo-266.ino.bin; do
	#cp "firmware/ttgo_lilygo_266_build/$fwfile" "$target/firmware/ttgo_lilygo_266_build/$fwfile"
#done
