// Asset loading + parsing for SpriteCollab sprites and PMDCollab RawAsset VFX.

const images = new Map();

export function loadImage(src) {
  if (images.has(src)) return images.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
  images.set(src, p);
  return p;
}

export async function loadText(src) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Failed to load ${src} (${res.status})`);
  return res.text();
}

export async function loadJSON(src) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Failed to load ${src} (${res.status})`);
  return res.json();
}

/**
 * Parse a SpriteCollab AnimData.xml.
 * Returns { shadowSize, anims: { Name: { name, file, fw, fh, durations, rush, hit, ret } } }
 * `file` is the anim whose PNG actually holds the frames (resolves <CopyOf>).
 */
export function parseAnimData(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const num = (el, tag) => {
    const n = el.getElementsByTagName(tag)[0];
    return n ? Number(n.textContent) : undefined;
  };
  const shadowSize = num(doc.documentElement, 'ShadowSize') ?? 1;
  const raw = {};
  for (const a of doc.getElementsByTagName('Anim')) {
    const name = a.getElementsByTagName('Name')[0].textContent.trim();
    const copy = a.getElementsByTagName('CopyOf')[0];
    raw[name] = copy
      ? { name, copyOf: copy.textContent.trim() }
      : {
          name,
          file: name,
          fw: num(a, 'FrameWidth'),
          fh: num(a, 'FrameHeight'),
          durations: [...a.getElementsByTagName('Duration')].map((d) => Number(d.textContent)),
          rush: num(a, 'RushFrame'),
          hit: num(a, 'HitFrame'),
          ret: num(a, 'ReturnFrame'),
        };
  }
  const anims = {};
  for (const [name, a] of Object.entries(raw)) {
    if (a.copyOf) {
      const src = raw[a.copyOf];
      if (src && !src.copyOf) anims[name] = { ...src, name };
    } else anims[name] = a;
  }
  return { shadowSize, anims };
}

/**
 * RawAsset particle naming: Name.Tag.png
 *   None / Flip -> one row, square frames (size = image height)
 *   DirN        -> N rows (PMD direction order), square frames
 *   <number>    -> one row of exactly <number> frames
 */
export function particleLayout(name, img) {
  const tag = name.slice(name.lastIndexOf('.') + 1);
  let rows = 1;
  let fw;
  let fh = img.height;
  if (/^Dir\d+$/.test(tag)) {
    rows = Number(tag.slice(3));
    fh = img.height / rows;
    fw = fh;
  } else if (/^\d+$/.test(tag)) {
    fw = img.width / Number(tag);
  } else {
    fw = fh;
  }
  return { img, name, tag, rows, fw, fh, frames: Math.max(1, Math.round(img.width / fw)), flip: tag === 'Flip' };
}

export async function loadParticle(name) {
  const img = await loadImage(`assets/vfx/particle/${name}.png`);
  return particleLayout(name, img);
}

/** Beam sets: Head / Body / Tail strips laid out pointing DOWN (+y), TotalFrames from BeamData.xml. */
export async function loadBeam(set) {
  const dir = `assets/vfx/${set.toLowerCase()}`;
  const [head, body, tail, xml] = await Promise.all([
    loadImage(`${dir}/Head.png`),
    loadImage(`${dir}/Body.png`),
    loadImage(`${dir}/Tail.png`),
    loadText(`${dir}/BeamData.xml`),
  ]);
  const frames = Number((xml.match(/<TotalFrames>(\d+)<\/TotalFrames>/) || [])[1] || 1);
  const part = (img) => ({ img, fw: img.width / frames, fh: img.height });
  return { set, frames, head: part(head), body: part(body), tail: part(tail) };
}

/** Load everything a fighter needs: AnimData + the anim PNGs listed in assets/manifest.json + portraits. */
export async function loadFighterArt(entry, manifest) {
  const id = entry.spriteId;
  const animData = parseAnimData(await loadText(`assets/sprites/${id}/AnimData.xml`));
  const have = new Set(manifest.sprites[id] || []);
  const sheets = {};
  // Only keep anims whose sheet was downloaded (the rest fall back, see sprite.js).
  for (const [k, a] of Object.entries(animData.anims)) if (!have.has(a.file)) delete animData.anims[k];
  await Promise.all(
    [...new Set(Object.values(animData.anims).map((a) => a.file))].map(async (file) => {
      sheets[file] = await loadImage(`assets/sprites/${id}/${file}-Anim.png`);
    }),
  );
  const portraits = {};
  await Promise.all(
    (manifest.portraits[id] || []).map(async (p) => {
      portraits[p] = `assets/portraits/${id}/${p}.png`;
      await loadImage(portraits[p]);
    }),
  );
  return { animData, sheets, portraits };
}
