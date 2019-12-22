const fs = require('fs');
const path = require('path');
const EventEmitter = require('events').EventEmitter;
const schemaGenerationService = require('./schemaGenerationService');

let schemaSearchService = {};
schemaSearchService.eventEmitter = new EventEmitter();

schemaSearchService.search = (directoriesToSearch) => {
  return new Promise((resolve, reject) => {
    let dataDirectoryPromises = [];

    directoriesToSearch.forEach((dir) => {
      const promise = readInstallPackageFiles(dir);
      dataDirectoryPromises.push(promise);
      promise.then(() => {
        schemaSearchService.eventEmitter.emit('directory-done', {
          'directory': dir
        });
      });
    });

    Promise.all(dataDirectoryPromises).then((results) => {
      resolve(results.flat());
    });
  });
};

schemaSearchService.getSchemasInFile = getSchemasInFile;

module.exports = schemaSearchService;

function readInstallPackageFiles (directory) {
  return new Promise((resolve, reject) => {
    fs.readdir(directory, function (err, files) {
      if (err) { reject(err); }
      
      let fileSchemaPromises = [];

      schemaSearchService.eventEmitter.emit('directory-scan', {
        'fileCount': files.length
      });
      
      files.forEach((file) => {
        const promise = getSchemasInFile(path.join(directory, file));
        fileSchemaPromises.push(promise);
        promise.then(() => {
          schemaSearchService.eventEmitter.emit('file-done', {
            'file': file
          });
        });
      });

      Promise.all(fileSchemaPromises).then((promises) => {
        resolve(promises.flat());
      });
    });
  });
};

function getSchemasInFile (file) {
  return new Promise((resolve, reject) => {
    const rs = fs.createReadStream(file);
    let schemas = [];
    let currentSchema, checkSchema, checkRemainingString, checkBeginning, checkText, checkEnd;
    const beginningCheck = '000100000970';
    const schemaCheck = '652D536368656D6173';
    const endCheck = '3C2F4672616E546B446174613E';
    const endSchemaLookForward = 13; // length of the above hex string (</FranTkData>) plus the closing '>' not included in the string above.

    rs.on('data', (chunk) => {
      const chunkBeginningIndex = chunk.indexOf(beginningCheck, 0, 'hex');
      const hasSchema = chunk.indexOf(schemaCheck, 0, 'hex');
      const endSchemaIndex = chunk.indexOf(endCheck, 0, 'hex');

      if (currentSchema && currentSchema.length > 1000000) {
        currentSchema = null;
        checkEnd = false;
      }

      if (checkRemainingString) {
        const remainingCheckInChunk = chunk.indexOf(checkRemainingString, 0, 'hex') === 0;

        if (remainingCheckInChunk) {
          if (checkEnd) {
            const schema = Buffer.concat([currentSchema, chunk.slice(0, checkRemainingString.length / 2)]);
            currentSchema = null;
            parseSchema(schema);
            checkEnd = false;
          }
        }
        else if (checkBeginning || checkText || !checkEnd) {
          checkBeginning = false;
          checkText = false;
          currentSchema = null;
        }

        checkRemainingString = null;
      }

      if (checkSchema) {
        if (hasSchema === -1) {
          currentSchema = null;
        }

        checkSchema = false;
      }

      if (chunkBeginningIndex > -1 && hasSchema > -1) {
        if (endSchemaIndex > -1) {
          if (endSchemaIndex > chunkBeginningIndex && endSchemaIndex > hasSchema) {
            // schema is entirely contained in the chunk
            parseSchema(chunk.slice(chunkBeginningIndex, endSchemaIndex + endSchemaLookForward));
            currentSchema = null;
          }
          else {
            if (currentSchema) {
              // one schema ends in the chunk while another begins
              parseSchema(Buffer.concat([currentSchema, chunk.slice(0, endSchemaIndex + endSchemaLookForward)]));
              currentSchema = null;
            }

            // find the real chunk start, we already verified that the schema start is in this chunk
            const newChunkToCheck = chunk.slice(0, hasSchema);
            const newBeginning = newChunkToCheck.lastIndexOf(beginningCheck, -1, 'hex');
            currentSchema = chunk.slice(newBeginning);
          }
        }
        else {
          // need to check if chunk beginning is the real beginning
          const newChunkToCheck = chunk.slice(0, hasSchema);
          const newBeginning = newChunkToCheck.lastIndexOf(beginningCheck, -1, 'hex');
          currentSchema = chunk.slice(newBeginning);
        }
      }
      else if (chunkBeginningIndex > -1 && hasSchema === -1 && (chunk.length - chunkBeginningIndex) <= 50) {
        // chunk begin is in the schema but the schema check isnt there because the chunk is ending

        const remainingString = checkPartialMatch(chunk, schemaCheck);

        if (remainingString) {
          checkRemainingString = remainingString;
          checkText = true;
        }
        else {
          checkSchema = true;
        }

        currentSchema = chunk.slice(chunkBeginningIndex);
      }
      else if (endSchemaIndex > -1 && currentSchema) {
        // schema ends in the chunk
        const schema = Buffer.concat([currentSchema, chunk.slice(0, endSchemaIndex + endSchemaLookForward)]);        
        parseSchema(schema);
        currentSchema = null;
      }
      else if ((currentSchema && endSchemaIndex === -1) || (currentSchema && chunkBeginningIndex === -1 && hasSchema > -1)) {
        const remainingString = checkPartialMatch(chunk, endCheck);

        if (remainingString) {
          checkRemainingString = remainingString;
          currentSchema = Buffer.concat([currentSchema, chunk]);
          checkEnd = true;
        }
        else {
          // the stream is still going!
          currentSchema = Buffer.concat([currentSchema, chunk]);
        }
      }
      else {
        // check any edge cases for the chunk beginning, schema, or end

        if (!currentSchema) {
          // look for a match with the first 2 chars
          // look at the next character to see if it matches, etc... until the end
          // next chunk, look for the entire remaining pattern as the first chars
          
          const partialMatch = checkPartialMatch(chunk, beginningCheck);
          
          if (partialMatch) {
            checkRemainingString = partialMatch;
            checkBeginning = true;
            checkSchema = true;
            currentSchema = chunk.slice(((beginningCheck.length - partialMatch.length) / 2) * -1);
          }
        }
      }
    });
    
    rs.on('close', () => {
      resolve(schemas);
    });

    function parseSchema(schema) {
      const uncompressedSchema = schemaGenerationService.generate(schema);
      const schemaHeader = uncompressedSchema.slice(0, 226).toString();
    
      const schemaRegex = /databaseName="Madden(\d+).+" dataMajorVersion="(\d+)" dataMinorVersion="(\d+)"/;
      const regexResult = schemaRegex.exec(schemaHeader);
    
      if (regexResult) {
        schemas.push({
          'meta': {
            'gameYear': parseInt(regexResult[1]),
            'major': parseInt(regexResult[2]),
            'minor': parseInt(regexResult[3]),
            'fileExtension': '.xml'
          },
          'data': uncompressedSchema
        });
      }
    };

    function checkPartialMatch (chunk, check) {
      let sliceToCheck = chunk.slice(-1 * (check.length / 2 - 1));
      const match = sliceToCheck.indexOf(check.slice(0, 2), 0, 'hex');
      const firstByteMatchedInChunk = match > -1;

      if (firstByteMatchedInChunk) {
        const matchIsNotLastByteInChunk = match < sliceToCheck.length - 1;

        if (matchIsNotLastByteInChunk) {
          const matchedRemainingCheck = sliceToCheck.indexOf(check.slice(2, (sliceToCheck.length - match) * 2), 0, 'hex');

          if (matchedRemainingCheck > -1) {
            return check.slice((sliceToCheck.length - match) * 2);
          }
          else {
            return checkPartialMatch(sliceToCheck.slice(match + 1), check)
          }
        }
        else {
          return check.slice(2);
        }
      }
    };
  });
};