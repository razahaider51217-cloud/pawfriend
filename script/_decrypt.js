const crypto = require('crypto');

// Replicate CryptoJS.AES.decrypt(cipher, passphrase) which uses EVP_BytesToKey(MD5)
// CryptoJS OpenSSL format: "Salted__" (8) + salt (8) + ciphertext
function evpBytesToKey(password, salt, keySize, ivSize) {
  let keyIv = Buffer.alloc(0);
  let block = Buffer.alloc(0);
  while (keyIv.length < keySize + ivSize) {
    const hash = crypto.createHash('md5');
    hash.update(block);
    hash.update(password);
    hash.update(salt);
    block = hash.digest();
    keyIv = Buffer.concat([keyIv, block]);
  }
  return { key: keyIv.slice(0, keySize), iv: keyIv.slice(keySize, keySize + ivSize) };
}

function decrypt(cipherB64, passphrase) {
  const data = Buffer.from(cipherB64, 'base64');
  const magic = data.slice(0, 8).toString('utf8');
  if (magic !== 'Salted__') throw new Error('No Salted__ magic, magic=' + magic);
  const salt = data.slice(8, 16);
  const ciphertext = data.slice(16);
  const { key, iv } = evpBytesToKey(Buffer.from(passphrase), salt, 32, 16);
  const d = crypto.createDecipheriv('aes-256-cbc', key, iv);
  d.setAutoPadding(true);
  return Buffer.concat([d.update(ciphertext), d.final()]).toString('utf8');
}

const URL_KEY = "UrLk3yShopEase01";
const ENC_DATA_ORIGIN = "U2FsdGVkX18JZvv8fViH31oQKNcacU1hdQ7Lk9NOh61zn2yw40umOQWqqCs22XmymK/z639+VjB8K2WTXQd4mw==";

const dataOrigin = decrypt(ENC_DATA_ORIGIN, URL_KEY);
console.log("DATA_ORIGIN =", dataOrigin);
console.log("DATA_URL    =", dataOrigin + "/data");