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

import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const RUN_TMP_DIR = '/tmp/atelier-petpooja';

// Where the browser package puts the shared libraries and the fonts when it
// unpacks them into the temporary folder.
const LIB_DIR = join(RUN_TMP_DIR, 'al2023', 'lib');
const FONT_DIR = join(RUN_TMP_DIR, 'fonts');

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

  // A half-unpacked folder is worse than a missing one: the unpack is skipped
  // when the folder is already there, and the browser then dies on a library
  // that was never written. So an incomplete library folder is removed and
  // the next run unpacks it properly.
  if (existsSync(join(RUN_TMP_DIR, 'al2023')) && !existsSync(join(LIB_DIR, 'libnspr4.so'))) {
    try {
      rmSync(join(RUN_TMP_DIR, 'al2023'), { recursive: true, force: true });
    } catch {
      // Left as it is.
    }
  }

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
