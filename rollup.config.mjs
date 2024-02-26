import nodeResolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import terser from "@rollup/plugin-terser";
import babel from "@rollup/plugin-babel";
import pkg from './package.json' assert { type: "json" };
import commonjs from '@rollup/plugin-commonjs';


const config = [
	{
                input: 'dist/install-button.js',
                output: {
                        name: 'howLongUntilLunch',
                        //file: pkg.browser,
			dir: "dist/webumd",
                        format: 'umd',
			inlineDynamicImports: true,
                },
                plugins: [
                        nodeResolve({preferBuiltins: false}), // so Rollup can find `ms`
                        commonjs(), // so Rollup can convert `ms` to an ES module
			json(),
                ]
        },
	];

if (process.env.NODE_ENV === "production") {
  config.plugins.push(
    terser({
      ecma: 2019,
      toplevel: true,
      format: {
        comments: false,
      },
    })
  );
}

export default config;
