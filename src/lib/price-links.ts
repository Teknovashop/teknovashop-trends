export type CountryCode = "ES" | "MX" | "AR" | "US" | "CO" | "CL" | "PE";

export function buildLinks(q: string, country: CountryCode) {
  // encode
  const s = encodeURIComponent(q.trim());

  const googleWeb     = `https://www.google.com/search?q=${s}`;
  const googleShopping= `https://www.google.com/search?tbm=shop&q=${s}`;

  const amazon = {
    ES: `https://www.amazon.es/s?k=${s}`,
    MX: `https://www.amazon.com.mx/s?k=${s}`,
    US: `https://www.amazon.com/s?k=${s}`,
  }[country] || `https://www.amazon.com/s?k=${s}`;

  const ebay = {
    ES: `https://www.ebay.es/sch/i.html?_nkw=${s}`,
    US: `https://www.ebay.com/sch/i.html?_nkw=${s}`,
    MX: `https://www.ebay.com/sch/i.html?_nkw=${s}`,
  }[country] || `https://www.ebay.com/sch/i.html?_nkw=${s}`;

  const mercadolibre = {
    AR: `https://listado.mercadolibre.com.ar/${s}`,
    MX: `https://listado.mercadolibre.com.mx/${s}`,
    CO: `https://listado.mercadolibre.com.co/${s}`,
    CL: `https://listado.mercadolibre.cl/${s}`,
    PE: `https://listado.mercadolibre.com.pe/${s}`,
  }[country];

  // comparadores populares (cambian por país)
  const comparadores = {
    ES: [
      { name: "Idealo", url: `https://www.idealo.es/precios.aspx?q=${s}` },
      { name: "PcComponentes (buscador)", url: `https://www.pccomponentes.com/buscar/?query=${s}` },
    ],
    MX: [
      { name: "Kuantokusta MX (si aplica)", url: googleWeb },
    ],
    US: [
      { name: "Google Shopping (US)", url: googleShopping },
    ],
    AR: [{ name: "Google Shopping", url: googleShopping }],
    CO: [{ name: "Google Shopping", url: googleShopping }],
    CL: [{ name: "Google Shopping", url: googleShopping }],
    PE: [{ name: "Google Shopping", url: googleShopping }],
  }[country] || [{ name: "Google Shopping", url: googleShopping }];

  const marketplaces = [
    { name: "Amazon", url: amazon },
    { name: "eBay", url: ebay },
    ...(mercadolibre ? [{ name: "MercadoLibre", url: mercadolibre }] : []),
  ];

  const meta = [
    { name: "Google Shopping", url: googleShopping },
    { name: "Google (web)", url: googleWeb },
  ];

  return { meta, marketplaces, comparadores };
}
