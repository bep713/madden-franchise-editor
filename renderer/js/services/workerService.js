const { ipcRenderer, remote, shell } = require('electron');
const dialog = remote.dialog;
const app = remote.app;

const fs = require('fs');
const zlib = require('zlib');
// const sharp = require('sharp');
// const dxt = require('dxt-js');
// const through2 = require('through2');
// const debug = require('debug')('worker-service');

const DDSFile = require('madden-file-tools/filetypes/DDSFile');
const DDSParser = require('madden-file-tools/streams/DDSParser');
const ASTParser = require('madden-file-tools/streams/ASTParser');

let workerService = {};

workerService.start = function () {
    // extractAndConvertPlayerPortraits();
};

module.exports = workerService;

// function extractAndConvertPlayerPortraits() {
//     const parser = new ASTParser();

//     for(let i = 0; i < 9999; i++) {
//         const j = changeEndianness(i.toString('16').padStart(8, '0'));
//         parser.extractByFileId(j);
//     }

//     const playerPortraitPath = 'D:\\Projects\\Madden 20\\ASTs\\portraits.AST';
//     const stream = fs.createReadStream(playerPortraitPath)

//     stream.on('end', function () {
//         console.timeEnd('time');
//     });

//     console.time('time');

//     parser.on('compressed-file', function (buf) {
//         const id = buf.toc.id.slice(0, 4).readUIntLE(0, 4);
//         const ddsParser = new DDSParser();

//         buf.stream
//             .pipe(zlib.createInflate())
//             .pipe(ddsParser)
//             .pipe(through2(function (buf, _, next) {
//                 if (this.ddsData === undefined) { 
//                     this.ddsData = buf; 
//                 }
//                 else { 
//                     this.ddsData = Buffer.concat([this.ddsData, buf]); 
//                 }

//                 next();
//             }, function (end) {
//                 const file = new DDSFile(this.ddsData);
//                 file.parse();

//                 const imageData = dxt.decompress(this.ddsData.slice(ddsParser._file.header.images[0].offset), ddsParser._file.header.width, ddsParser._file.header.height, dxt.flags.DXT5);
//                 this.push(imageData);
//                 end();
//             }))
//             .pipe(sharp(this.imageData, {
//                 'raw': {
//                     'width': 256,
//                     'height': 256,
//                     'channels': 4
//                 }
//             }).webp())
//             .pipe(fs.createWriteStream('D:\\Projects\\Madden 20\\test-webp\\' + id + '.webp'));
//     });

//     stream
//         .pipe(parser)
// };

// function changeEndianness (string) {
//     const result = [];
//     let len = string.length - 2;
//     while (len >= 0) {
//       result.push(string.substr(len, 2));
//       len -= 2;
//     }
//     return result.join('');
// };