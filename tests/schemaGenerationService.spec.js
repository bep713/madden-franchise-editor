const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { expect } = require('chai');
const schemaGenerationService = require('../renderer/js/services/schemaGenerationService');

const COMPRESSED_SCHEMA_FIRST_BLOCK_PATH = path.join(__dirname, './data/schemas/M22-compressed-schema-block-0.dat');
const COMPRESSED_SCHEMA_SECOND_BLOCK_PATH = path.join(__dirname, './data/schemas/M22-compressed-schema-block-1.dat');

const COMPRESSED_SCHEMA_CHUNK = {
    blocks: [
        {
            meta: {
                size: 65536,
                compressedSize: 15958
            },
            data: fs.readFileSync(COMPRESSED_SCHEMA_FIRST_BLOCK_PATH),
        },
        {
            meta: {
                size: 65536,
                compressedSize: 15879
            },
            data: fs.readFileSync(COMPRESSED_SCHEMA_SECOND_BLOCK_PATH)
        }
    ]
};

const UNCOMPRESSED_SCHEMA_FIRST_BLOCK_PATH = path.join(__dirname, './data/schemas/M22-uncompressed-schema-block-0.dat');
const UNCOMPRESSED_SCHEMA_SECOND_BLOCK_PATH = path.join(__dirname, './data/schemas/M22-uncompressed-schema-block-1.dat');

const EXPECTED_RESULT = Buffer.concat([
    fs.readFileSync(UNCOMPRESSED_SCHEMA_FIRST_BLOCK_PATH), 
    fs.readFileSync(UNCOMPRESSED_SCHEMA_SECOND_BLOCK_PATH)
]);

describe('Schema generation service unit tests', () => {
    describe('can generate an uncompressed schema from a compressed schema', () => {
        it('returns expected result', async () => {
            const uncompressedSchema = schemaGenerationService._generateUncompressedSchema(COMPRESSED_SCHEMA_CHUNK);
            testBufferHashes(uncompressedSchema, EXPECTED_RESULT);
        });
    });
});

function testBufferHashes(bufferToTest, bufferToCompare) {
    let testHash = crypto.createHash('sha1');
    testHash.update(bufferToTest);

    let compareHash = crypto.createHash('sha1');
    compareHash.update(bufferToCompare);

    expect(testHash.digest('hex')).to.eql(compareHash.digest('hex'));
};