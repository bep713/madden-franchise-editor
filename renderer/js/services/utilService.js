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

utilService.bin2Float = function (binary) {
  const buffer = Buffer.from(utilService.bin2hex(binary), 'hex');

  if (buffer.length >= 4) {
    return buffer.readFloatBE(0);
  } else {
    return 0;
  }
};

utilService.float2Bin = function (float) {
  const getHex = i => ('00' + i.toString(16)).slice(-2);

  var view = new DataView(new ArrayBuffer(4)),
      result;

  view.setFloat32(0, float);

  result = Array
      .apply(null, { length: 4 })
      .map((_, i) => getHex(view.getUint8(i)))
      .join('');

  return utilService.hex2bin(result).padStart(32, '0');
};

utilService.uintToInt = function (uint, nbit) {
  nbit = +nbit || 32;
  if (nbit > 32) throw new RangeError('uintToInt only supports ints up to 32 bits');
  uint <<= 32 - nbit;
  uint >>= 32 - nbit;
  return uint;
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

  try {
    const bits = arr.map((decimal) => {
      return (decimal).toString(2).padStart(8, '0');
    }).reduce((prev, curr, idx) => {
      return prev + curr;
    });
  
    return bits;
  }
  catch(err) {
    return null;
  }
};

utilService.replaceAt = function (oldValue, index, value) {
  return oldValue.substr(0, index) + value + oldValue.substr(index + value.length);
};

utilService.byteArrayToLong = function(byteArray, reverse) {
  let newByteArray;

  if (Buffer.isBuffer(byteArray)) {
    newByteArray = Buffer.from(byteArray);
  } else {
    newByteArray = byteArray.slice();
  }

  if (reverse) {
    newByteArray = newByteArray.reverse();
  }
  
  var value = 0;
  for ( var i = newByteArray.length - 1; i >= 0; i--) {
      value = (value * 256) + newByteArray[i];
  }

  return value;
};

utilService.show = function (element) {
  element.classList.remove('hidden');
};

utilService.hide = function (element) {
  element.classList.add('hidden');
};

utilService.arrayMove = function (arr, old_index, new_index) {
  if (new_index >= arr.length) {
      var k = new_index - arr.length + 1;
      while (k--) {
          arr.push(undefined);
      }
  }
  arr.splice(new_index, 0, arr.splice(old_index, 1)[0]);
  return arr;
};

utilService.removeChildNodes = function (node) {
  while (node.firstChild) {
      node.removeChild(node.firstChild);
  }
};

module.exports = utilService;