import { escapeHtml as h } from './forms.js';
import { photosFor } from './photos.js';

export function photoGallery(trail, index = 0) {
  const items = photosFor(trail.id);
  if (!items.length) return '<p class="planning-note">No photo with verified reuse rights is available.</p>';
  const photo = items[((index % items.length) + items.length) % items.length];
  return `<section class="photo-gallery" aria-label="Photos of ${h(trail.name)}" data-gallery="${h(trail.id)}" data-index="${items.indexOf(photo)}">
    <h2>Along the route</h2><p class="planning-note">Historical photos, not current trail conditions or accessibility evidence.</p>
    <div class="gallery-controls"><button type="button" data-photo-step="-1" aria-label="Previous photo">← Previous</button>
      <span role="status">Photo ${items.indexOf(photo) + 1} of ${items.length}</span>
      <button type="button" data-photo-step="1" aria-label="Next photo">Next →</button></div>
    <figure class="trail-photo"><img src="${h(photo.asset)}" alt="${h(photo.caption)}" style="max-width:${photo.width}px" loading="lazy" data-trail-photo>
      <p class="planning-note" data-photo-error hidden>Photo unavailable. Try another photo or open its source below.</p>
      <figcaption><p>${h(photo.caption)} <span>Photographed ${h(photo.date)}.</span></p>
        <p>${h(photo.creator)} · ${photo.licenseUrl ? `<a href="${h(photo.licenseUrl)}" target="_blank" rel="noopener">${h(photo.license)}</a>` : h(photo.license)} · via Wikimedia Commons</p>
        <details><summary>Image credit &amp; rights</summary><p><a href="${h(photo.source)}" target="_blank" rel="noopener">${h(photo.title)}</a> — ${h(photo.creator)}.</p>
          <p>${h(photo.basis)} <a href="${h(photo.rightsEvidence)}" target="_blank" rel="noopener">Individual rights evidence ↗</a></p><p>${h(photo.changes)} Rights reviewed ${photo.reviewed}. No endorsement implied.</p></details>
      </figcaption></figure></section>`;
}
