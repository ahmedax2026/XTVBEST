import fs from 'node:fs/promises';
const files = ['XBEST-icon16.png', 'XBEST-icon32.png', 'XBEST-icon180.png'];
const images = await Promise.all(files.map((file) => fs.readFile('server/src/resources/images/' + file)));
const header = Buffer.alloc(6 + images.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
for (const [index, png] of images.entries()) {
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid original XBEST PNG');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 256 || height > 256) throw new Error('XBEST icon dimensions must be 1–256');
  const position = 6 + index * 16;
  header.writeUInt8(width % 256, position);
  header.writeUInt8(height % 256, position + 1);
  header.writeUInt16LE(1, position + 4);
  header.writeUInt16LE(32, position + 6);
  header.writeUInt32LE(png.length, position + 8);
  header.writeUInt32LE(offset, position + 12);
  offset += png.length;
}
await fs.mkdir('server/bin', { recursive: true });
await fs.writeFile('server/bin/XBEST.ico', Buffer.concat([header, ...images]));
