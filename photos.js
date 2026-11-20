// Individual file-page rights reviewed 2026-11-16; no blanket NPS reuse claim.
// Historical photographs are not evidence of present conditions or accessibility.
const licenses = {
  SA2: ['CC BY-SA 2.0', 'https://creativecommons.org/licenses/by-sa/2.0/'],
  SA3: ['CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/3.0/'],
  SA4: ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'],
  BY2: ['CC BY 2.0', 'https://creativecommons.org/licenses/by/2.0/'],
  PDself: ['Public domain — author release', null],
  PDnps: ['US public domain — NPS official work', null],
  PDdot: ['US public domain — DOT official work', null]
};
const rows = [
  ['riverside-walk', 'Riverside_Walk,_Zion_NP.JPG', '1/1f', 'McGhiever', 'SA3', '2012-05-18', 'Riverside Walk / Gateway to the Narrows, Zion. Not the Narrows river hike.', 'Own-work copyright-holder CC grant.', 600],
  ['riverside-walk', 'Riverside_Walk_to_Zion_Narrows,_Zion_Canyon,_Zion_National_Park,_Utah_(8096057571).jpg', '1/1b', 'Ken Lund', 'SA2', '2012-10-13', 'Riverside Walk toward Zion Narrows. Named corridor, not a claim that river hiking is this paved route.', 'Flickr CC grant reviewed by Commons 2016-03-16.', 4000],
  ['bear-lake', '1-Bear-Lake.JPG', '6/62', 'Elmschrat', 'SA3', '2010-07-08', 'Bear Lake, Rocky Mountain National Park. Lake scenery, not trail-surface evidence.', 'Own-work CC grant; CC selected rather than alternative GFDL.', 3264],
  ['bear-lake', '2-Bear-Lake.JPG', 'b/b8', 'Elmschrat', 'SA3', '2010-07-08', 'Another view of Bear Lake. Lake scenery, not trail-surface evidence.', 'Own-work CC grant; CC selected rather than alternative GFDL.', 3264],
  ['flattop-mountain', 'Flattop_Mountain_and_trail.jpg', 'f/fc', 'Brian & Jaclyn Drum', 'BY2', '2010-07-31', 'Flattop Mountain and trail, Rocky Mountain National Park.', 'Flickr CC grant reviewed by Commons 2011-04-26.', 2816],
  ['flattop-mountain', 'Cairn_on_Flattop_Mountain.jpg', 'c/c2', 'Brian & Jaclyn Drum', 'BY2', '2010-07-31', 'Cairn on Flattop Mountain. Mountain/summit scenery.', 'Flickr CC grant reviewed by Commons 2011-04-26.', 2816],
  ['hall-of-mosses', 'Hall_of_Mosses_(38882640114).jpg', 'c/cf', 'Bernd Thaller', 'BY2', '2017-09-08', 'Mossy maples, Hall of Mosses, Hoh Rain Forest. Named trail setting supported by file/Exif label.', 'Flickr CC grant reviewed by Commons 2020-08-31. Original 30.91 MB; use smaller rendition.', 7000],
  ['hall-of-mosses', 'Moss_covered_tree,_Hall_of_Mosses_Trail,_Hoh_Rainforest.jpg', 'b/b4', 'Ron Clausen', 'SA4', '2017-09-27', 'Moss-covered tree, Hall of Mosses Trail, Hoh Rainforest.', 'Own-work copyright-holder CC grant.', 1704],
  ['lower-yosemite-fall', 'Yosemite_-_Lower_Falls_from_Trail.jpg', '3/35', 'Chris Dunstan (Ctdunstan)', 'PDself', '2002-12-28', 'Lower Yosemite Fall viewed from trail. Exact camera spot not established.', 'Worldwide PD-self release, fallback any purpose/no conditions unless law.', 1600],
  ['lower-yosemite-fall', 'Lower_Yosemite_Fall_as_viewed_from_the_bridge_20220523_170443_HDR.jpg', '8/83', 'Steveshelokhonov', 'SA4', '2022-05-23', 'Lower Yosemite Fall viewed from the bridge, Yosemite National Park.', 'Own-work copyright-holder CC grant.', 3000],
  ['limberlost', 'Limberlost_Trail_(1ae36eed-155d-451f-6713-2159f4f21f66).jpg', '1/1a', 'National Park Service', 'PDnps', '2013-04-30', 'Limberlost Trail, Shenandoah National Park.', 'Individual PD-US-NPS official-duty employee work, not merely an NPS hostname. Worldwide PD status not independently established.', 2850],
  ['limberlost', 'Skyline_Drive_-_The_Limberlost_Trail_-_NARA_-_7722206.jpg', '2/27', 'Courtesy Shenandoah National Park / NARA, photographer unknown', 'PDdot', '1995–2013', 'Historical Limberlost Trail near Skyline Parkway, surrounded by mountain laurel. Small archival image.', 'Record explicitly public domain; individual DOT official-duty work. Worldwide PD status not independently established.', 534],
  ['desert-discovery', 'View_of_the_start_of_Desert_Discovery_Nature_Trail,_showing_lush_vegetation_and_a_shaded_ramada._(478a1db8-8847-49ac-b3f1-29d8ea043770).jpg', '7/76', 'National Park Service', 'PDnps', '2024-05-09', 'Start of Desert Discovery Nature Trail: paved trail, vegetation and shaded ramada.', 'Individual PD-US-NPS official-duty work; accession 478a1db8, title TMD_DesertDiscovery_ramada.jpg. Worldwide PD status not independently established.', 2252],
  ['desert-discovery', 'View_of_the_start_of_Desert_Discovery_Nature_Trail,_showing_lush_vegetation_and_a_shaded_ramada._(3d73c866-ef80-4868-9703-e8e025d5501c).jpg', 'd/d2', 'National Park Service', 'PDnps', '2024-05-09', 'Desert Discovery Nature Trail: paved trail, shaded ramada and bench. Similar view to the preceding photo.', 'Individual PD-US-NPS official-duty work; accession 3d73c866, title TMD_DesertDiscovery_trail.jpg. Worldwide PD status not independently established.', 2252],
  ['alpine-lakes-loop', 'Great_Basin_National_Park_-_Stella_Lake.JPG', 'c/c0', 'Jrmichae', 'SA4', '2014-07-07', 'Stella Lake on the Alpine Lakes Loop, Great Basin National Park. Lake scenery, not trail-surface evidence.', 'Own-work copyright-holder CC grant. NPS identifies Stella Lake along the Alpine Lakes Loop; exact camera spot not established.', 3264]
];

export const photos = rows.map(([trailId, file, hash, creator, rights, date, caption, basis, width], index) => {
  const encoded = encodeURIComponent(file);
  const source = `https://commons.wikimedia.org/wiki/File:${encoded}`;
  const original = `https://upload.wikimedia.org/wikipedia/commons/${hash}/${encoded}`;
  return { id: index, trailId, title: file.replaceAll('_', ' '), creator, date, caption, basis, source, original, asset: `photos/${trailId}-${index}.jpg`,
    license: licenses[rights][0], licenseUrl: licenses[rights][1], rightsEvidence: source + '#Licensing',
    src: width <= 960 ? original : `https://upload.wikimedia.org/wikipedia/commons/thumb/${hash}/${encoded}/960px-${encoded}`,
    width: Math.min(width, 960), changes: width <= 960 ? 'Unmodified original; displayed without cropping.' : 'Wikimedia resized rendition; displayed without cropping.', reviewed: trailId === 'alpine-lakes-loop' ? '2026-11-19' : '2026-11-16' };
});

export const photosFor = trailId => photos.filter(photo => photo.trailId === trailId);
