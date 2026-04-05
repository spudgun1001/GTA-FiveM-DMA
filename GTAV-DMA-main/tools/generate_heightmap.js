#!/usr/bin/env node
// Generate compact heightmap.bin from the full RageMP GTA V heightmap data.
//
// Source: https://github.com/Andreas1331/ragemp-gtav-heightmap
//   Download GTAV_HeightMap_Data.data from data_file/ in that repo.
//
// Usage:
//   node generate_heightmap.js <path_to_GTAV_HeightMap_Data.data> [cell_size]
//
// Output: heightmap.bin (place next to DMA exe)
//
// The source file is a raw float32 grid at 1m resolution:
//   Map bounds: X = [-4100, 4300] (width 8400), Y = [-4300, 7825] (height 12125)
//   Layout: row-major, Y-first. Offset for (x,y) = ((y - minY) * width + (x - minX)) * 4

const fs = require('fs');

const SRC_MIN_X = -4100;
const SRC_MIN_Y = -4300;
const SRC_WIDTH = 8400;  // 4300 - (-4100)
const SRC_HEIGHT = 12125; // 7825 - (-4300)

const inputPath = process.argv[2];
const cellSize = parseInt(process.argv[3]) || 10;

if (!inputPath) {
    console.log('Usage: node generate_heightmap.js <GTAV_HeightMap_Data.data> [cell_size]');
    console.log('');
    console.log('Download the source file from:');
    console.log('  https://github.com/Andreas1331/ragemp-gtav-heightmap/raw/master/data_files/GTAV_HeightMap_Data.data');
    console.log('');
    console.log('Default cell_size is 10 (meters). Smaller = more precise but bigger file.');
    process.exit(1);
}

console.log(`Reading source heightmap: ${inputPath}`);
const srcBuf = fs.readFileSync(inputPath);
const srcFloats = new Float32Array(srcBuf.buffer, srcBuf.byteOffset, srcBuf.byteLength / 4);

const expectedSize = SRC_WIDTH * SRC_HEIGHT;
console.log(`Source: ${srcFloats.length} floats (expected ${expectedSize})`);

if (srcFloats.length < expectedSize) {
    console.error('Source file too small!');
    process.exit(1);
}

// Downsample
const outW = Math.floor(SRC_WIDTH / cellSize);
const outH = Math.floor(SRC_HEIGHT / cellSize);
const outFloats = new Float32Array(outW * outH);

console.log(`Downsampling ${SRC_WIDTH}x${SRC_HEIGHT} -> ${outW}x${outH} (cell=${cellSize}m)`);

for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
        // Sample the center of each cell, take max of a small area for safety
        const srcX = ox * cellSize + Math.floor(cellSize / 2);
        const srcY = oy * cellSize + Math.floor(cellSize / 2);

        let maxZ = 0;
        // Sample a 3x3 area around center for robustness
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const sx = Math.min(Math.max(srcX + dx, 0), SRC_WIDTH - 1);
                const sy = Math.min(Math.max(srcY + dy, 0), SRC_HEIGHT - 1);
                const val = srcFloats[sy * SRC_WIDTH + sx];
                if (val > maxZ) maxZ = val;
            }
        }

        outFloats[oy * outW + ox] = maxZ;
    }
}

// Write compact format with header
const headerSize = 4 * 3 + 4 * 2; // 3 floats + 2 uint32s = 20 bytes
const outBuf = Buffer.alloc(headerSize + outW * outH * 4);

outBuf.writeFloatLE(SRC_MIN_X, 0);          // minX
outBuf.writeFloatLE(SRC_MIN_Y, 4);          // minY
outBuf.writeFloatLE(cellSize, 8);            // cellSize
outBuf.writeUInt32LE(outW, 12);              // gridW
outBuf.writeUInt32LE(outH, 16);              // gridH

Buffer.from(outFloats.buffer).copy(outBuf, headerSize);

const outputPath = 'heightmap.bin';
fs.writeFileSync(outputPath, outBuf);

const sizeMB = (outBuf.length / (1024 * 1024)).toFixed(1);
console.log(`Written ${outputPath}: ${outW}x${outH} grid, ${sizeMB}MB`);
console.log('Place this file next to the DMA exe.');
