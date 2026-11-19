import { escapeHtml as h } from './forms.js';
import { photosFor } from './photos.js';

export function explorePhoto(trail) {
  const photo = photosFor(trail.id)[0];
  if (!photo) return '';
  return `<figure class="explore-photo" data-explore-photo="${h(trail.id)}">
    <a href="#trail/${encodeURIComponent(trail.id)}" aria-label="View ${h(trail.name)}">
      <img src="${h(photo.asset)}" alt="${h(photo.caption)}" width="640" height="360" loading="lazy" data-trail-photo></a>
    <p class="planning-note" data-photo-error hidden>Photo unavailable. Open its source below.</p>
    <figcaption><details><summary>Photo credit &amp; rights</summary>
      <p><a href="${h(photo.source)}" target="_blank" rel="noopener">${h(photo.title)}</a> — ${h(photo.creator)}.</p>
      <p>${photo.licenseUrl ? `<a href="${h(photo.licenseUrl)}" target="_blank" rel="noopener">${h(photo.license)}</a>` : h(photo.license)} · <a href="${h(photo.rightsEvidence)}" target="_blank" rel="noopener">Individual rights evidence ↗</a></p>
      <p>${h(photo.basis)} Photographed ${h(photo.date)}. Gallery rendition: ${h(photo.changes)} Card display cropped to 16:9. Rights reviewed ${h(photo.reviewed)}. No endorsement implied.</p>
      <p>Historical photo, not current trail conditions or accessibility evidence.</p>
    </details></figcaption></figure>`;
}
