'use strict';

// Synthetic page for the magic-scraper CDP probe spec. Every value that must stay
// out of probe output carries SECRET. Secrets used as keys or path segments also
// carry a digit or colon, which marks them as data rather than schema.
const SECRET = 'SYNTHETIC-SECRET';

function createSyntheticPageScope() {
  const nextData = {
    props: {
      pageProps: {
        viewer: { email: `${SECRET}-NEXT-EMAIL@example.test`, csrfToken: `${SECRET}-NEXT-CSRF` },
        items: [
          { offerId: 1001, title: `${SECRET}-NEXT-TITLE` },
          { offerId: 1002, title: `${SECRET}-NEXT-TITLE-2` },
        ],
      },
    },
    buildId: `${SECRET}-NEXT-BUILD`,
  };
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${SECRET}-JSON-LD-NAME`,
    offers: { price: `${SECRET}-JSON-LD-PRICE` },
  };
  const anchors = [
    {
      href: `https://shop.example.test/products/1001?ref=list&session=${SECRET}-LINK-SESSION`,
      textContent: `${SECRET}-LINK-TEXT`,
    },
    {
      href: `https://shop.example.test/products/1002?session=${SECRET}-LINK-SESSION&ref=list`,
      textContent: `${SECRET}-LINK-TEXT`,
    },
    { href: `https://shop.example.test/offer/${SECRET}-7f3c9a1e.html`, textContent: `${SECRET}-LINK-TEXT` },
    { href: 'https://shop.example.test/help', textContent: 'Help' },
    { href: `mailto:${SECRET}-MAIL@example.test`, textContent: `${SECRET}-MAIL` },
  ];
  const nextDataScript = { textContent: JSON.stringify(nextData) };
  const jsonLdScripts = [
    { textContent: JSON.stringify(jsonLd) },
    { textContent: `{"name":"${SECRET}-BROKEN-JSON-LD"` },
  ];

  return {
    location: {
      href: `https://shop.example.test/products/${SECRET}-5d41402a?page=2&token=${SECRET}-PAGE-TOKEN#access_token=${SECRET}-FRAGMENT`,
    },
    document: {
      title: `${SECRET}-TITLE`,
      cookie: `sid=${SECRET}-COOKIE`,
      body: { innerText: `${SECRET}-BODY-TEXT` },
      documentElement: { outerHTML: `<html><body>${SECRET}-HTML</body></html>`, scrollHeight: 2000 },
      querySelector: (selector) => (selector === 'script#__NEXT_DATA__' ? nextDataScript : null),
      querySelectorAll: (selector) => {
        if (selector === 'a[href]') return anchors;
        if (selector === 'script[type="application/ld+json"]') return jsonLdScripts;
        return [];
      },
    },
    scrollTo: () => undefined,
    context: {
      result: {
        global: {
          globalData: {
            model: {
              offerDetail: {
                offerId: 1001,
                subject: `${SECRET}-MODEL-SUBJECT`,
                imageList: [{ fullPathImageURI: `https://img.example.test/1001.jpg?sig=${SECRET}-IMAGE-SIG` }],
              },
              tradeModel: { minPrice: `${SECRET}-MODEL-PRICE`, skuMap: [] },
            },
          },
        },
        data: { productPackInfo: { fields: { unitWeight: 1 } } },
      },
    },
    __INIT_DATA__: {
      user: { nickname: `${SECRET}-INIT-NICKNAME`, loggedIn: true },
      [`${SECRET}:session`]: { token: `${SECRET}-INIT-TOKEN` },
    },
    __APOLLO_STATE__: {
      ROOT_QUERY: { viewer: { __ref: `User:${SECRET}-1` } },
      [`User:${SECRET}-1`]: { __typename: 'User', email: `${SECRET}-APOLLO-EMAIL@example.test` },
      [`User:${SECRET}-2`]: { __typename: 'User', email: null },
    },
  };
}

module.exports = { SECRET, createSyntheticPageScope };
