import { describe, test, expect } from "bun:test"
import {
  buildSearchUrl,
  detailUrlFromId,
  normalizeId,
  parseJobCards,
  parseJobDetail,
  parseRelativeDate,
  parseSpanishLongDate,
  parseTotalCount,
  slugify,
} from "../src/helpers"

// Fixtures below are trimmed excerpts of real markup captured live from
// sv.computrabajo.com on 2026-08-20 (search "atencion al cliente"), kept
// verbatim so the regex parsers are pinned against the actual site shape.

const CARD_WITH_COMPANY = `<article class="box_offer sel outstanding" data-id='7B6E24E019D87EB161373E686DCF3405' data-blind="false" id="7B6E24E019D87EB161373E686DCF3405" data-lc="ListOffers-Score4-0" data-offers-grid-offer-item-container>
        <div class="list_dot mb15">
                <span class="fc_urgent">
                    Se precisa Urgente
                </span>
        </div>
    <h2 class="fs18 fwB prB">
        <a class="js-o-link fc_base" href="/ofertas-de-trabajo/oferta-de-trabajo-de-promotor-de-ventas-experiencia-en-ventas-o-atencion-al-cliente-en-san-francisco-menendez-7B6E24E019D87EB161373E686DCF3405#lc=ListOffers-Score4-0">
            Promotor de ventas
        </a>
    </h2>
    <p class="dFlex vm_fx fs16 fc_base mt5">
            <span class="icon i_verificada mr5"></span>
            <a class="fc_base t_ellipsis" href="https://sv.computrabajo.com/empresas/ofertas-de-trabajo-de-distribuidora-me-llega-F91E492AF24A60FC" target='_blank' offer-grid-article-company-url>
                Distribuidora Me Llega
            </a>
    </p>
    <p class="fs16 fc_base mt5">
        <span class="mr10">
            San Francisco Men&#xE9;ndez, Ahuachap&#xE1;n
        </span>
    </p>
        <div class="fs13 mt15">
                <span class="dIB mr10">
                    <span class="icon i_salary"></span>
                    409.00 US$ (Mensual) &#x2B; Comisiones
                </span>
        </div>
    <p class="fs13 fc_aux mt15">
        Hace  49  minutos
    </p>
</article>`

const CARD_WITHOUT_COMPANY = `<article class="box_offer  outstanding" data-id='6A0546EA7AB8C14061373E686DCF3405' data-blind="false" id="6A0546EA7AB8C14061373E686DCF3405" data-lc="ListOffers-Score4-1" data-offers-grid-offer-item-container>
    <h2 class="fs18 fwB prB">
        <a class="js-o-link fc_base" href="/ofertas-de-trabajo/oferta-de-trabajo-de-atencion-al-cliente-en-san-salvador-6A0546EA7AB8C14061373E686DCF3405#lc=ListOffers-Score4-1">
            Atenci&#xF3;n al cliente
        </a>
    </h2>
    <p class="dFlex vm_fx fs16 fc_base mt5">
Importante empresa del sector    </p>
    <p class="fs16 fc_base mt5">
        <span class="mr10">
            San Salvador, San Salvador
        </span>
    </p>
    <p class="fs13 fc_aux mt15">
        Hace  m&#xE1;s de 30  d&#xED;as
    </p>
</article>`

const SEARCH_PAGE_HEADING = `<h1 class="title_page" style="z-index: 0;">
                <span class="fwB">
                    1,227
                </span>
                Ofertas de trabajo de atencion al cliente
            </h1>`

const DETAIL_HTML = `
<h1 class="fwB fs24 mb5 box_detail w100_m">Promotor de ventas - Experiencia en ventas o atenci&#xF3;n al cliente.</h1>
    <p class="fs16">Distribuidora Me Llega - San Francisco Men&#xE9;ndez, Ahuachap&#xE1;n</p>
<div class="mb40 pb40 bb1" div-link="oferta">
	<h3 class="fwB fs18 mb20">Descripci&#xF3;n de la oferta</h3>
	<div class="mbB">
			<span class="tag base mb10">409.00 US$ (Mensual) &#x2B; Comisiones</span>
			<span class="tag base mb10">Contrato por tiempo indefinido</span>
			<span class="tag base mb10">Tiempo Completo</span>
	</div>
	<p class="mbB">Somos distribuidora Me Llega.<br />&#xA1;Queremos seas parte!<br /><br />Requisitos:<br />Experiencia en ventas</p>

		<p class="fwB fs18 mtB mb10">Requerimientos</p>
		<ul class="disc mbB">
			<li class='mb10'>Educaci&#xF3;n m&#xED;nima: Educaci&#xF3;n B&#xE1;sica Primaria</li><li class='mb10'>1 a&#xF1;o de experiencia</li>
		</ul>

		<p class="fc_aux fs13 mbB mtB">Palabras clave: promoter, promotor, cambaceo</p>

	<p class="fc_aux fs13">12 de agosto (actualizada)</p>
	<div class="posSticky_m bottom0 bg_white pAllB_m mtB">
		<a data-href-access="https://candidato.sv.computrabajo.com/match/?oi=7B6E24E019D87EB161373E686DCF3405&amp;p=57&amp;idb=1" data-href-offer-apply="https://candidato.sv.computrabajo.com/match/?oi=7B6E24E019D87EB161373E686DCF3405&amp;p=57&amp;idb=1" class="b_primary big w100 t_no_wrap" data-js-t-d>
			Postularme
		</a>
	</div>
</div>
`

describe("slugify", () => {
  test("strips accents and lowercases", () => {
    expect(slugify("atención al cliente")).toBe("atencion-al-cliente")
  });
  test("matches the site's department slugs", () => {
    expect(slugify("Usulután")).toBe("usulutan")
    expect(slugify("Cabañas")).toBe("cabanas")
    expect(slugify("La Unión")).toBe("la-union")
  });
});

describe("buildSearchUrl", () => {
  test("builds the /trabajo-de-<slug> path", () => {
    expect(buildSearchUrl("atencion al cliente", undefined, 1)).toBe(
      "https://sv.computrabajo.com/trabajo-de-atencion-al-cliente",
    )
  });
  test("appends -en-<department-slug> for a location", () => {
    expect(buildSearchUrl("atencion al cliente", "San Salvador", 1)).toBe(
      "https://sv.computrabajo.com/trabajo-de-atencion-al-cliente-en-san-salvador",
    )
  });
  test("appends ?p=<n> for page > 1, omits it for page 1", () => {
    expect(buildSearchUrl("ventas", undefined, 2)).toBe("https://sv.computrabajo.com/trabajo-de-ventas?p=2")
    expect(buildSearchUrl("ventas", undefined, 1)).not.toContain("p=")
  });
});

describe("normalizeId / detailUrlFromId", () => {
  test("accepts a bare hex ID", () => {
    expect(normalizeId("6A0546EA7AB8C14061373E686DCF3405")).toBe("6A0546EA7AB8C14061373E686DCF3405")
  });
  test("extracts the ID from a full URL", () => {
    expect(
      normalizeId(
        "https://sv.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-atencion-al-cliente-en-san-salvador-6A0546EA7AB8C14061373E686DCF3405#lc=ListOffers-Score4-1",
      ),
    ).toBe("6A0546EA7AB8C14061373E686DCF3405")
  });
  test("rejects garbage input", () => {
    expect(normalizeId("not-a-job-id")).toBeNull()
  });
  test("detailUrlFromId builds a resolving canonical URL shape", () => {
    expect(detailUrlFromId("6A0546EA7AB8C14061373E686DCF3405")).toBe(
      "https://sv.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-x-6A0546EA7AB8C14061373E686DCF3405",
    )
  });
});

describe("parseRelativeDate", () => {
  test("parses minutes/hours/days into an ISO date", () => {
    expect(parseRelativeDate("Hace  49  minutos")).toBe(new Date().toISOString().slice(0, 10))
  });
  test("returns null for the imprecise 'mas de 30 dias' bucket", () => {
    expect(parseRelativeDate("Hace  más de 30  días")).toBeNull()
  });
  test("returns null for missing input", () => {
    expect(parseRelativeDate(null)).toBeNull()
  });
});

describe("parseSpanishLongDate", () => {
  test("parses '<day> de <month>' text", () => {
    const result = parseSpanishLongDate("12 de agosto (actualizada)")
    expect(result).toMatch(/^\d{4}-08-12$/)
  });
  test("returns null when no date pattern is present", () => {
    expect(parseSpanishLongDate("sin fecha")).toBeNull()
  });
});

describe("parseJobCards", () => {
  const html = CARD_WITH_COMPANY + CARD_WITHOUT_COMPANY
  const cards = parseJobCards(html)

  test("parses both cards", () => {
    expect(cards).toHaveLength(2)
  });

  test("first card: title, company, location, salary, url all populated", () => {
    const c = cards[0]!
    expect(c.id).toBe("7B6E24E019D87EB161373E686DCF3405")
    expect(c.title).toBe("Promotor de ventas")
    expect(c.company).toBe("Distribuidora Me Llega")
    expect(c.location).toBe("San Francisco Menéndez, Ahuachapán")
    expect(c.salary).toContain("409.00 US$")
    expect(c.url).toBe(
      "https://sv.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-promotor-de-ventas-experiencia-en-ventas-o-atencion-al-cliente-en-san-francisco-menendez-7B6E24E019D87EB161373E686DCF3405",
    )
    expect(c.date).not.toBeNull()
  });

  test("second card: confidential employer -> company is null, never the placeholder text", () => {
    const c = cards[1]!
    expect(c.company).toBeNull()
    expect(c.title).toBe("Atención al cliente")
    expect(c.salary).toBeNull()
    expect(c.date).toBeNull() // "mas de 30 dias" is intentionally imprecise -> null
  });

  test("a malformed chunk does not break parsing of the rest", () => {
    const malformed = `<article class="box_offer" data-id='DEADBEEF00000000000000000000000'>` + `<h2 class="fs18 fwB prB">no closing anchor tag`
    const mixed = parseJobCards(malformed + CARD_WITH_COMPANY)
    expect(mixed).toHaveLength(1)
    expect(mixed[0]!.id).toBe("7B6E24E019D87EB161373E686DCF3405")
  });
});

describe("parseTotalCount", () => {
  test("parses the comma-thousands total from the results heading", () => {
    expect(parseTotalCount(SEARCH_PAGE_HEADING)).toBe(1227)
  });
  test("returns null when the heading is absent", () => {
    expect(parseTotalCount("<html></html>")).toBeNull()
  });
});

describe("parseJobDetail", () => {
  const job = parseJobDetail(DETAIL_HTML, "7B6E24E019D87EB161373E686DCF3405")

  test("title, company, location parsed from the h1/subtitle pair", () => {
    expect(job.title).toBe("Promotor de ventas - Experiencia en ventas o atención al cliente.")
    expect(job.company).toBe("Distribuidora Me Llega")
    expect(job.location).toBe("San Francisco Menéndez, Ahuachapán")
  });

  test("salary/contract/employment tags mapped in order", () => {
    expect(job.salary).toContain("409.00 US$")
    expect(job.contractType).toBe("Contrato por tiempo indefinido")
    expect(job.employmentType).toBe("Tiempo Completo")
  });

  test("description keeps line breaks and strips tags", () => {
    expect(job.description).toContain("Somos distribuidora Me Llega.")
    expect(job.description).toContain("Requisitos:")
  });

  test("requirements and keywords parsed as arrays", () => {
    expect(job.requirements.length).toBeGreaterThan(0)
    expect(job.keywords).toContain("promotor")
  });

  test("date parsed from the Spanish long-form date", () => {
    expect(job.date).toMatch(/-08-12$/)
  });

  test("url is the canonical detail URL built from id, not a scraped og:url", () => {
    expect(job.url).toBe(detailUrlFromId("7B6E24E019D87EB161373E686DCF3405"))
  });

  test("throws when the page has no title (parse failure surfaced, not silently empty)", () => {
    expect(() => parseJobDetail("<html><body>not a job page</body></html>", "X")).toThrow()
  });

  test("recent postings show a relative-time 'updated' date instead of the absolute form - both parse", () => {
    // Verified live: 2249A2B6AEA836F761373E686DCF3405's detail page carries
    // "Hace  2  d&#xED;as (actualizada)" here instead of "12 de agosto
    // (actualizada)". Both shapes must resolve to a non-null ISO date.
    const relativeHtml = DETAIL_HTML.replace(
      '<p class="fc_aux fs13">12 de agosto (actualizada)</p>',
      '<p class="fc_aux fs13">Hace  2  d&#xED;as (actualizada)</p>',
    )
    const relJob = parseJobDetail(relativeHtml, "7B6E24E019D87EB161373E686DCF3405")
    expect(relJob.date).not.toBeNull()
    expect(relJob.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  });
});
