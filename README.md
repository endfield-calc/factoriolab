# EndfieldLab

This is the repository for the [EndfieldLab](https://endfield-calc.github.io) project, a tool for calculating resource and factory requirements for Arknights: Endfield.

This project is forked from [FactorioLab](https://factoriolab.github.io).

To refresh Endfield data, run `npm run unpack-data` and `npm run build-data`
in the separate `endfield-data-builder` repository. Then run
`npm run import:endfield -- "<builder>/dist/calculator"` here, followed by
`npm run test:delivery`. The import preserves existing share-link indices.

**To submit suggestions or issues,** please check out the [issues page](https://github.com/endfield-calc/factoriolab/issues).
