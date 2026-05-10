# web.scrape

Downloads a web page and extracts structured data using CSS selectors or
XPath expressions. Ideal for monitoring price changes, gathering news
headlines, or pulling content from pages without a public API.

The schema is **scrape-shaped** — URL + selectors come first; the
optional power-user knobs (headers, timeout, baseUrl) follow. `method`
and `body` were dropped from the schema to keep the form distinct from
`http.request`. (At runtime the executor still honours them when an
older flow has them in JSON, but the property panel doesn't surface
them — use `http.request` if you need a non-GET fetch.)

## Prerequisites
* **Target URL** that allows automated scraping (check `robots.txt`).
* **Knowledge of the DOM** — inspect the target page to identify selectors.
* **Network access** from the worker.
* For initial testing: `https://example.com` (always reachable, simple structure).

## Inputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `url` | Required. Page to fetch and parse. | `https://example.com/products` |
| `queries` | Required. Array of extraction rules (see below). Renders as a table in the property panel. | — |
| `headers` | Optional. Request headers (cookies / auth / user-agent). | `{"Cookie": "session=abc"}` |
| `timeoutMs` | Optional. Abort after this many milliseconds (1–60 000, default 15 000). | `10000` |
| `baseUrl` | Optional. Override the document `baseURI` used to resolve relative href/src. | `https://example.com` |

### Query object properties
| Property | Description |
| :--- | :--- |
| `name` | Required. Becomes the key in `output.results`. |
| `type` | `css` (default) or `xpath`. |
| `selector` | Required. CSS selector or XPath expression. |
| `extract` | What to pull: `text` (default), `html`, `outerHTML`, or `attr`. |
| `attr` | Attribute name (e.g. `href`, `src`). Setting this implies `extract: attr`. |
| `all` | `true` returns an array of matches; `false` (default) returns the first match or null. |

## Outputs
| Name | Description | Sample |
| :--- | :--- | :--- |
| `url` | The URL that was fetched. | `https://example.com/item/123` |
| `status` | HTTP response status. | `200` |
| `headers` | Response headers. | `{"content-type": "text/html"}` |
| `results` | Object keyed by each query's `name`. | `{"productName": "Widget", "price": "$9.99"}` |

`primaryOutput`: `results`. Per-query failures are captured as `{ __error: "..." }` inside the relevant key, so one bad selector doesn't lose the rest of the extraction.

## Sample workflow

```json
{
  "name": "product-price-tracker",
  "description": "Scrape a product page for name and price, then log the result.",
  "nodes": [
    {
      "name": "scrape_product",
      "action": "web.scrape",
      "inputs": {
        "url": "https://example.com/item/123",
        "queries": [
          { "name": "productName", "type": "css",   "selector": "h1.product-title" },
          { "name": "price",       "type": "xpath", "selector": "//span[@class='price']/text()" },
          { "name": "image",       "type": "css",   "selector": "img#main-pic", "attr": "src" }
        ],
        "timeoutMs": 10000
      },
      "outputs": { "results": "scrapedData" }
    },
    {
      "name": "log_price",
      "action": "log",
      "inputs": {
        "message": "Product: ${scrapedData.productName} is currently ${scrapedData.price}"
      }
    }
  ],
  "edges": [
    { "from": "scrape_product", "to": "log_price" }
  ]
}
```

## Expected output

```json
{
  "url":     "https://example.com/item/123",
  "status":  200,
  "results": {
    "productName": "Wireless Headphones",
    "price":       "$99.99",
    "image":       "https://example.com/images/hp123.jpg"
  }
}
```

## Troubleshooting
* **User-Agent blocking.** Some sites block the default scraper UA. Pass a browser-style UA via `headers: { "user-agent": "..." }`.
* **JavaScript-rendered content.** This plugin uses `jsdom`, which doesn't execute client-side JS. SPAs that render data after page load won't yield results — use a headless browser (puppeteer/playwright) in a custom plugin or fetch the underlying API directly with `http.request`.
* **XPath errors.** A specific query's failure is captured as `{__error: "..."}` inside its key in `results` — the rest of the queries still run.
* **Relative URLs.** `<a href="/foo">` resolves through `baseUrl`. Set `baseUrl` if the page itself is fetched through a CDN with a different host than where the links should point.

## Library
* `jsdom` — pure-JS implementation of HTML/DOM/XPath.

## Reference
* [MDN CSS selectors](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors)
* [MDN XPath](https://developer.mozilla.org/en-US/docs/Web/XPath)
