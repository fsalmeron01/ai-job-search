import { describe, test, expect } from "bun:test";
import { parseJobCards, parseJobDetail, extractDivContent } from "../src/helpers";

// Minimal job-card-mobile fixture, mirroring the real markup: an actions row
// carrying data-job-id/data-share-url, then title/company/location rows.
// parseJobCards only reads .job-card-mobile blocks (the desktop .job-card
// variant for the same job is skipped so each job is counted once).
function mobileCard(
  id: string,
  title: string,
  opts: { company?: string; location?: string; slug?: string } = {},
): string {
  const company = opts.company ?? "Acme S.A. de C.V.";
  const location = opts.location ?? '<i class="map-point"></i>San Salvador,&nbsp;<span>El Salvador</span>';
  const slug = opts.slug ?? "puesto-de-trabajo";
  return `<div class="job-card-mobile">
    <div class="job-card-mobile__row-1">
        <div class="job-card-mobile__actions">
            <button class="job-card-mobile__action-btn job-card-mobile__action-favorite mark-job-favorite "
                    jobId="${id}" data-star-icon="star" title="Guardar en favoritos"></button>
            <button class="job-card-mobile__action-btn job-card-mobile__action-share job-share-trigger" type="button"
                    data-job-id="${id}" data-share-url="/${id}/${slug}.aspx" aria-expanded="false"></button>
        </div>
    </div>
    <div class="job-card-mobile__row-2">
        <div class="job-card-mobile__info-col">
            <span class="job-card-mobile__company-name subtitle">${company}</span>
            <div class="job-card-mobile__location-date">
                <span class="job-card-mobile__location">${location}</span>
                <span class="job-card-mobile__expiry"><i class="clock"></i>Expira en: 21/08/2026</span>
            </div>
        </div>
    </div>
    <div class="job-card-mobile__row-3">
        <h2 class="job-card-mobile__title" itemprop="title">
                <a jobId="${id}" href="/${id}/${slug}.aspx">${title}</a>
        </h2>
    </div>
    <div class="job-card-mobile__row-4">
            <a href="/${id}/${slug}.aspx" class="job-card-mobile__btn-see-offer">Ver Oferta</a>
    </div>
</div>`;
}

// The desktop variant of the same job, which real search-result pages also
// render (CSS toggles visibility, not presence). parseJobCards must not
// double-count it.
function desktopCard(id: string, title: string, slug = "puesto-de-trabajo"): string {
  return `<div class="job-card">
    <div class="job-card__content">
        <div class="job-card__content-info">
            <h2 class="title" itemprop="title">
                    <a jobId="${id}" href='/${id}/${slug}.aspx'>${title}</a>
            </h2>
            <span class="subtitle">Acme S.A. de C.V.</span>
        </div>
    </div>
    <div class="job-card__footer">
        <span class="sub-subtitle"><i class="map-point"></i><span>El Salvador</span></span>
    </div>
</div>`;
}

describe("parseJobCards", () => {
  test("extracts id, title, company, url from a mobile card", () => {
    const [card] = parseJobCards(mobileCard("1102092", "Asesor de Ventas"));
    expect(card.id).toBe("1102092");
    expect(card.title).toBe("Asesor de Ventas");
    expect(card.company).toBe("Acme S.A. de C.V.");
    expect(card.url).toBe("https://www.tecoloco.com.sv/1102092/puesto-de-trabajo.aspx");
  });

  test("location includes the city without a doubled space around the decoded &nbsp;", () => {
    const [card] = parseJobCards(mobileCard("1", "Title"));
    expect(card.location).toBe("San Salvador, El Salvador");
  });

  test("location falls back to country-only when no city span is present", () => {
    const [card] = parseJobCards(
      mobileCard("2", "Title", { location: '<i class="map-point"></i><span>El Salvador</span>' }),
    );
    expect(card.location).toBe("El Salvador");
  });

  test("date is always null — the search list has no posting-date field, only expiry", () => {
    const [card] = parseJobCards(mobileCard("3", "Title"));
    expect(card.date).toBeNull();
  });

  test("desktop .job-card blocks are ignored so a job appearing as both variants is counted once", () => {
    const html = desktopCard("500", "Duplicate") + mobileCard("500", "Duplicate");
    const cards = parseJobCards(html);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("500");
  });

  test("a card missing data-job-id is skipped without breaking the others", () => {
    const broken = `<div class="job-card-mobile"><h2 class="job-card-mobile__title"><a href="#">No ID</a></h2></div>`;
    const html = broken + mobileCard("600", "Good Card");
    const cards = parseJobCards(html);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("600");
  });

  test("decodes HTML entities in the title", () => {
    const [card] = parseJobCards(mobileCard("7", "Cajero/a &#8211; Sucursal Sant&#xE1;n"));
    expect(card.title).toBe("Cajero/a – Sucursal Santán");
  });

  test("no results on an empty results page", () => {
    expect(parseJobCards("<div class=\"search-result-container\"></div>")).toHaveLength(0);
  });
});

// Real detail-page markup shape (JobDesc.aspx?ID=<id>): an h1 title, a
// job-company <p>, job-info-label/job-info-value pairs, and a
// "Descripción de la oferta" section wrapping a section-content div.
function detailPage(opts: {
  title?: string;
  company?: string;
  location?: string;
  contractType?: string;
  published?: string;
  expiration?: string;
  experience?: string;
  descriptionHtml?: string;
} = {}): string {
  const {
    title = "Asesor de Ventas",
    company = "Acme S.A. de C.V.",
    location = "<span>El Salvador</span>",
    contractType = "Tiempo completo",
    published = "18/08/2026",
    expiration = "21/08/2026",
    experience = "De tres a cinco años",
    descriptionHtml = "<h3>Puesto</h3><p>Buscamos <strong>vendedores</strong>.</p><ul><li>Requisito 1</li></ul>",
  } = opts;
  return `<html><body>
    <h1 class="job-title">${title}</h1>
    <p class="job-company">${company}</p>
    <div class="job-info-grid">
        <div class="job-info-item">
            <span class="job-info-label">Ubicaci&oacute;n:</span>
            <span class="job-info-value">${location}</span>
        </div>
        <div class="job-info-item">
            <span class="job-info-label">Tipo de contrataci&oacute;n:</span>
            <span class="job-info-value">${contractType}</span>
        </div>
        <div class="job-info-item">
            <span class="job-info-label">Fecha de Publicaci&oacute;n</span>
            <span class="job-info-value">${published}</span>
        </div>
        <div class="job-info-item">
            <span class="job-info-label">Fecha de Expiraci&oacute;n:</span>
            <span class="job-info-value">${expiration}</span>
        </div>
        <div class="job-info-item">
            <span class="job-info-label">Nivel de experiencia:</span>
            <span class="job-info-value">${experience}</span>
        </div>
    </div>
    <section class="job-section">
        <h3 class="section-title">Descripci&oacute;n de la oferta</h3>
        <div class="section-content">${descriptionHtml}</div>
    </section>
  </body></html>`;
}

describe("parseJobDetail", () => {
  test("extracts title, company, and info-grid fields", () => {
    const job = parseJobDetail(detailPage(), "1102092");
    expect(job.title).toBe("Asesor de Ventas");
    expect(job.company).toBe("Acme S.A. de C.V.");
    expect(job.employmentType).toBe("Tiempo completo");
    expect(job.experienceLevel).toBe("De tres a cinco años");
    expect(job.publishedDate).toBe("18/08/2026");
    expect(job.expirationDate).toBe("21/08/2026");
    expect(job.date).toBe("18/08/2026"); // date mirrors publishedDate per the contract
  });

  test("location unwraps a nested <span> without leaving a dangling tag", () => {
    const job = parseJobDetail(detailPage({ location: "<span>El Salvador</span>" }), "1");
    expect(job.location).toBe("El Salvador");
  });

  test("description strips tags, decodes entities, and keeps paragraph/list breaks", () => {
    const job = parseJobDetail(detailPage(), "1");
    expect(job.description).toContain("Puesto");
    // Inline tags like <strong> are stripped to a space (not removed outright),
    // so "vendedores</strong>." becomes "vendedores ." — expected, matches the
    // repo-wide stripTags behavior (see linkedin-search/src/helpers.ts).
    expect(job.description).toContain("Buscamos vendedores");
    expect(job.description).toContain("Requisito 1");
    expect(job.description).toContain("\n");
  });

  test("description survives a nested <div> inside employer-supplied HTML", () => {
    const job = parseJobDetail(
      detailPage({ descriptionHtml: "<div>Requisitos:</div><p>5 años de experiencia</p>" }),
      "1",
    );
    expect(job.description).toContain("Requisitos:");
    expect(job.description).toContain("5 años de experiencia");
  });

  test("url points at JobDesc.aspx?ID=<id> regardless of the original slug", () => {
    const job = parseJobDetail(detailPage(), "1102092");
    expect(job.url).toBe("https://www.tecoloco.com.sv/JobDesc.aspx?ID=1102092");
  });

  test("applyUrl always routes through Tecoloco's own login-gated apply flow", () => {
    const job = parseJobDetail(detailPage(), "1102092");
    expect(job.applyUrl).toBe("https://www.tecoloco.com.sv/Jobs/Aplicar/1102092");
  });

  test("missing fields degrade to null instead of throwing", () => {
    const job = parseJobDetail("<html><body>no matching markup</body></html>", "1");
    expect(job.title).toBe("(untitled)");
    expect(job.company).toBeNull();
    expect(job.location).toBeNull();
    expect(job.employmentType).toBeNull();
    expect(job.description).toBeNull();
  });
});

describe("extractDivContent", () => {
  test("extracts content from a simple div", () => {
    expect(extractDivContent('<div class="section-content">Simple text</div>', "section-content")).toBe(
      "Simple text",
    );
  });

  test("handles nested divs by tracking depth", () => {
    const html = `<div class="section-content"><div>Inner</div><p>Text</p></div>`;
    expect(extractDivContent(html, "section-content")).toBe("<div>Inner</div><p>Text</p>");
  });

  test("returns null when the class is not found", () => {
    expect(extractDivContent("<div>no class</div>", "nonexistent")).toBeNull();
  });
});
