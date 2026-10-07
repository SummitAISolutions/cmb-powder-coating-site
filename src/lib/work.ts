/**
 * CMB Powder Coating's real work photographs (owner-supplied, permission
 * given 2026-10-07; visual/image-plan.md slot "work-photos"). Every file in
 * src/assets/work/ is an authentic photo of a part the shop coated, adjusted
 * only globally (levels, mild sharpening, metadata stripped). Nothing here is
 * generated or retouched.
 *
 * `alt` describes the real part and its finish. `caption` is the short
 * functional line shown under it in the gallery. `group` places it on the
 * Our Work page. Pages import photos by key, so one photo has one description
 * everywhere it appears.
 */
import type { ImageMetadata } from 'astro';

import frameEbikeBlack from '../assets/work/frame-ebike-black.jpg';
import excavatorBucket from '../assets/work/equipment-excavator-bucket-white.jpg';
import fireHydrants from '../assets/work/equipment-fire-hydrants.jpg';
import texturedMetallic from '../assets/work/wheel-textured-metallic.jpg';
import bronzePair from '../assets/work/wheels-bronze-pair.jpg';
import lightBluePair from '../assets/work/wheels-light-blue-pair.jpg';
import lightBluePair2 from '../assets/work/wheels-light-blue-pair-2.jpg';
import silverPair from '../assets/work/wheels-silver-pair.jpg';
import glossBlackTop from '../assets/work/wheel-gloss-black-top.jpg';
import glossBlackAngle from '../assets/work/wheel-gloss-black-angle.jpg';
import gunmetalPair from '../assets/work/wheels-gunmetal-pair.jpg';
import glossRed from '../assets/work/wheel-gloss-red.jpg';
import calipersSilver from '../assets/work/calipers-silver-pair.jpg';
import glossBlackSixSpoke from '../assets/work/wheels-gloss-black-six-spoke.jpg';
import whiteLip from '../assets/work/wheel-white-lip.jpg';
import whiteFace from '../assets/work/wheel-white-face.jpg';
import copperRack from '../assets/work/wheel-copper-flake-rack.jpg';
import copperRack2 from '../assets/work/wheel-copper-flake-rack-2.jpg';
import copperFace from '../assets/work/wheel-copper-flake-face.jpg';

export type WorkGroup = 'wheels' | 'calipers' | 'frames' | 'equipment';

export interface WorkPhoto {
  key: string;
  src: ImageMetadata;
  alt: string;
  caption: string;
  group: WorkGroup;
  /** Original file name from the owner, for provenance (visual/image-plan.md). */
  original: string;
}

export const WORK_GROUPS: { id: WorkGroup; name: string }[] = [
  { id: 'wheels', name: 'Wheels and rims' },
  { id: 'calipers', name: 'Brake calipers' },
  { id: 'frames', name: 'Frames' },
  { id: 'equipment', name: 'Equipment and commercial' },
];

const photos: WorkPhoto[] = [
  { key: 'copper-face', src: copperFace, group: 'wheels', original: 'IMG_8752', alt: 'Copper metal-flake powder-coated wheel hanging on an outdoor rack, seen face on', caption: 'Copper metal flake' },
  { key: 'copper-rack', src: copperRack, group: 'wheels', original: 'IMG_8750', alt: 'Copper metal-flake powder-coated wheel hanging on an outdoor rack under a blue sky', caption: 'Copper metal flake, on the rack' },
  { key: 'copper-rack-2', src: copperRack2, group: 'wheels', original: 'IMG_8751', alt: 'Copper metal-flake powder-coated wheel on the outdoor rack, seen from the side, with a second wheel behind it', caption: 'Copper metal flake, side view' },
  { key: 'bronze-pair', src: bronzePair, group: 'wheels', original: 'IMG_0263', alt: 'Pair of wheels powder coated in gloss bronze, standing on a wood floor', caption: 'Gloss bronze pair' },
  { key: 'gloss-red', src: glossRed, group: 'wheels', original: 'IMG_1241', alt: 'Wheel powder coated in gloss red, close up', caption: 'Gloss red' },
  { key: 'gloss-black-top', src: glossBlackTop, group: 'wheels', original: 'IMG_0546', alt: 'Gloss black powder-coated wheel lying on a wood floor, seen from above', caption: 'Gloss black, from above' },
  { key: 'gloss-black-angle', src: glossBlackAngle, group: 'wheels', original: 'IMG_0550', alt: 'Gloss black powder-coated wheel on a wood floor, seen at an angle to show the barrel', caption: 'Gloss black, barrel and face' },
  { key: 'gloss-black-six-spoke', src: glossBlackSixSpoke, group: 'wheels', original: 'IMG_1308', alt: 'Pair of six-spoke wheels powder coated gloss black', caption: 'Gloss black six-spoke pair' },
  { key: 'white-face', src: whiteFace, group: 'wheels', original: 'IMG_3505', alt: 'Multi-spoke wheel powder coated white, with a black center', caption: 'White, multi-spoke' },
  { key: 'white-lip', src: whiteLip, group: 'wheels', original: 'IMG_3502', alt: 'Close-up of the lip and spokes of a white powder-coated wheel', caption: 'White, lip detail' },
  { key: 'silver-pair', src: silverPair, group: 'wheels', original: 'IMG_0456', alt: 'Pair of wheels powder coated silver, resting on a rug', caption: 'Silver pair' },
  { key: 'gunmetal-pair', src: gunmetalPair, group: 'wheels', original: 'IMG_0746', alt: 'Pair of wheels powder coated gunmetal gray, laid on a canvas sheet', caption: 'Gunmetal gray pair' },
  { key: 'light-blue-pair', src: lightBluePair, group: 'wheels', original: 'IMG_0346', alt: 'Pair of wheels powder coated light blue, outdoors in the sun', caption: 'Light blue pair' },
  { key: 'light-blue-pair-2', src: lightBluePair2, group: 'wheels', original: 'IMG_3097', alt: 'Light blue powder-coated wheel leaning on its pair, outdoors', caption: 'Light blue, second view' },
  { key: 'textured-metallic', src: texturedMetallic, group: 'wheels', original: 'IMG_0095', alt: 'Wheel powder coated in a dark textured metallic finish, against a dark background', caption: 'Dark textured metallic' },
  { key: 'calipers-silver', src: calipersSilver, group: 'calipers', original: 'IMG_1262', alt: 'Pair of brake calipers powder coated silver', caption: 'Silver brake calipers' },
  { key: 'frame-ebike', src: frameEbikeBlack, group: 'frames', original: '20260625_124458', alt: 'Electric bike frame powder coated satin black, assembled on a work stand', caption: 'Electric bike frame, satin black' },
  { key: 'excavator-bucket', src: excavatorBucket, group: 'equipment', original: '264304119401604406', alt: 'Excavator bucket and thumb attachment powder coated white, fitted to a mini excavator outdoors', caption: 'Excavator bucket and thumb, white' },
  { key: 'fire-hydrants', src: fireHydrants, group: 'equipment', original: 'IMG_3197', alt: 'Three fire hydrants powder coated red, one with a white top and one with yellow caps', caption: 'Fire hydrants, red with white and yellow' },
];

const byKey = new Map(photos.map((photo) => [photo.key, photo]));

/** One photo by key; an unknown key stops the build. */
export function work(key: string): WorkPhoto {
  const photo = byKey.get(key);
  if (!photo) throw new Error(`Work photo "${key}" is not in src/lib/work.ts.`);
  return photo;
}

export const workPhotos = (group?: WorkGroup) => (group ? photos.filter((photo) => photo.group === group) : photos.slice());
