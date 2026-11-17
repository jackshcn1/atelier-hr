/**
 * One temporary folder for the browser on the serverless host.
 *
 * The serverless temporary folder is only 512MB and the browser is about
 * 210MB of it, so everything the browser needs has to live in ONE place, and
 * that place has to be decided before the browser is unpacked.
 *
 * @sparticuz/chromium reads the temporary folder in three places:
 *
 *   - when the package is LOADED, to record where the shared libraries
 *     (`libnspr4.so` and friends) and the fonts are, in `LD_LIBRARY_PATH`
 *     and `FONTCONFIG_PATH`;
 *   - when the browser is UNPACKED, to decide where the browser, the
 *     libraries and the fonts go;
 *   - when the browser PROFILE is created.
 *
 * If the folder is not the same for all three, the browser looks for its
 * libraries in a folder they were never unpacked into, and it dies at once
 * with `libnspr4.so: cannot open shared object file`.
 *
 * The second thing this file prevents is the browser being unpacked twice.
 * The unpack is skipped when the browser is already there, so as long as the
 * folder never changes, there is exactly one copy of it — and the folder
 * changing between two requests is what used to leave a second copy behind
 * and fill the disk.
 */

import { mkdirSync, rmSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const RUN_TMP_DIR = '/tmp/atelier-petpooja';

// Where the browser package puts the shared libraries and the fonts when it
// unpacks them into the temporary folder.
const LIB_DIR = join(RUN_TMP_DIR, 'al2023', 'lib');
const FONT_DIR = join(RUN_TMP_DIR, 'fonts');
const BROWSER_FILE = join(RUN_TMP_DIR, 'chromium');

// The browser itself is about 200MB. Anything much smaller is a half-written
// file from an unpack that ran out of disk.
const BROWSER_MIN_BYTES = 100 * 1024 * 1024;

// Remove a file or folder if it exists.
function remove(path) {
  try {
    rmSync(path, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Repair an unpack that did not finish.
 *
 * The browser package unpacks its files once and then never again: it skips
 * the unpack whenever the file is already there. So an unpack that was cut
 * short — by a full disk, which is exactly what a browser crash used to
 * cause — leaves a broken file behind for ever, and the browser that is
 * built from it dies the moment it opens a page.
 *
 * Each part is therefore checked, and a part that is not whole is removed so
 * that the next unpack writes it properly.
 */
function repairUnpack() {
  // The shared libraries: without them the browser does not start at all.
  if (existsSync(join(RUN_TMP_DIR, 'al2023')) && !existsSync(join(LIB_DIR, 'libnspr4.so'))) {
    remove(join(RUN_TMP_DIR, 'al2023'));
  }

  // The fonts: the browser's renderer checks them and dies without them.
  if (existsSync(FONT_DIR) && !existsSync(join(FONT_DIR, 'fonts.conf'))) {
    remove(FONT_DIR);
  }

  // The browser itself, when the unpack was cut short.
  try {
    if (existsSync(BROWSER_FILE) && statSync(BROWSER_FILE).size < BROWSER_MIN_BYTES) {
      remove(BROWSER_FILE);
    }
  } catch {
    // Nothing to check.
  }
}

// A browser that dies writes a core dump the size of its own memory — about
// 900MB on this host — and the disk is 512MB. One crash is enough to fill it,
// and then the browser cannot even be unpacked. A dump is only ever written
// by a browser that has already died, so removing one is always safe.
function clearCoreDumps() {
  for (const folder of ['/tmp', RUN_TMP_DIR]) {
    let entries = [];
    try {
      entries = readdirSync(folder);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.startsWith('core.chromium') && !name.startsWith('core.headless')) continue;
      remove(join(folder, name));
    }
  }
}

/**
 * Write the font configuration for this folder.
 *
 * The font configuration that comes with the browser names `/tmp/fonts` as
 * the place the fonts are in — it is written for the layout where the
 * browser's temporary folder *is* `/tmp`. Move the browser into a folder of
 * its own and the fonts go with it, but the configuration still points at the
 * old place, so the browser finds no fonts at all and stops dead:
 *
 *   FATAL:../third_party/skia/src/ports/SkFontMgr_FontConfigInterface.cpp:163]
 *   Not implemented.
 *
 * So the configuration is written again, pointing at the folder the fonts
 * really are in. It is called after the browser is unpacked, because that is
 * when the fonts arrive — and the unpack can bring the old configuration back
 * with it.
 */
export function writeFontConfig() {
  const config = `<?xml version="1.0" ?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${FONT_DIR}</dir>
  <dir>${join(FONT_DIR, 'fonts')}</dir>
  <cachedir>${join(RUN_TMP_DIR, 'font-cache')}</cachedir>
</fontconfig>
`;
  try {
    mkdirSync(FONT_DIR, { recursive: true });
    mkdirSync(join(RUN_TMP_DIR, 'font-cache'), { recursive: true });
    writeFileSync(join(FONT_DIR, 'fonts.conf'), config);
    return true;
  } catch {
    return false;
  }
}

/**
 * Point the browser at one folder, and make sure the folder is the one the
 * browser package already knows about.
 *
 * Safe to call more than once — it is called when this file is loaded and
 * again before the browser is unpacked.
 */
export function useBrowserTempDir() {
  try {
    mkdirSync(RUN_TMP_DIR, { recursive: true });
  } catch {
    // No permission — the system folder will have to do.
  }

  // Room for the browser, before anything is unpacked.
  clearCoreDumps();

  // Everything the browser writes goes here: the browser itself, its shared
  // libraries, its fonts, its profile and the files it downloads.
  process.env.TMPDIR = RUN_TMP_DIR;

  // The browser package records these paths when it is loaded, which happens
  // before this code can run, so they are set here as well. Whichever of the
  // two happened first, the browser finds its libraries and its fonts.
  const libPath = process.env.LD_LIBRARY_PATH || '';
  if (!libPath.split(':').includes(LIB_DIR)) {
    process.env.LD_LIBRARY_PATH = libPath ? `${LIB_DIR}:${libPath}` : LIB_DIR;
  }
  process.env.FONTCONFIG_PATH = FONT_DIR;
  process.env.HOME = RUN_TMP_DIR;

  // A half-written unpack is worse than a missing one: the unpack is skipped
  // whenever the file is already there, so a browser built from half a file
  // stays broken for ever.
  repairUnpack();

  return RUN_TMP_DIR;
}

// Set the folder as this file is loaded, so that a browser package imported
// after it records the same folder.
//
// Only on the serverless host: this file is also imported by the sync engine,
// which runs on the office computer, and there the folder is the engine's own
// business. The serverless route calls `useBrowserTempDir()` itself before it
// unpacks the browser, so the folder is set there either way.
if (process.env.VERCEL) useBrowserTempDir();
