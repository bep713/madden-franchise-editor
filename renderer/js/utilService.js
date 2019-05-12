let utilService = {};

utilService.intersection = function (arrayOfArrays) {
  return arrayOfArrays
      .reduce((acc,array,index) => { // Intersect arrays
          if (index === 0)
              return array;
          return array.filter((value) => acc.includes(value));
      }, [])
      .filter((value, index, self) => self.indexOf(value) === index) // Make values unique
  ;
};

utilService.dec2bin = function (dec, len) {
  const bin = (dec >>> 0).toString(2);
  if (len) return bin.padStart(len, '0');
  return bin;
};

utilService.bin2dec = function (binary) {
  return parseInt(binary, 2);
};

utilService.hex2bin = function (hex) {
  return (parseInt(hex, 16).toString(2)).padStart(8, '0');
};

utilService.bin2hex = function (bin) {
  return parseInt(bin, 2).toString(16).padStart(2, '0').toUpperCase();
};

utilService.chunk = function (str, n) {
  var ret = [];
  var i;
  var len;

  for(i = 0, len = str.length; i < len; i += n) {
      ret.push(str.substr(i, n))
  }

  return ret;
};

utilService.binaryBlockToHexBlock = function (binary) {
  const byteArray = utilService.chunk(binary, 8);

  let bytes = [];
  
  byteArray.forEach((byte) => {
    const hex = utilService.bin2hex(byte);

    if (hex) {
      bytes.push(hex); 
    }
  });

  return bytes;
};

utilService.binaryBlockToDecimalBlock = function (binary) {
  const byteArray = utilService.chunk(binary, 8);

  let bytes = [];
  
  byteArray.forEach((byte) => {
    const dec = utilService.bin2dec(byte);

    if (dec !== null && dec !== undefined) {
      bytes.push(dec);
    }
  });

  return bytes;
};

utilService.getBitArray = function (data) {
  let arr = [...data];

  const bits = arr.map((decimal) => {
    return (decimal).toString(2).padStart(8, '0');
  }).reduce((prev, curr, idx) => {
    return prev + curr;
  });

  return bits;
};

utilService.replaceAt = function (oldValue, index, value) {
  return oldValue.substr(0, index) + value + oldValue.substr(index + value.length);
};

module.exports = utilService;