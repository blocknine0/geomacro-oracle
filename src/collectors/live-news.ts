import Parser from "rss-parser";

const parser = new Parser();

const FEEDS = [
  "https://feeds.bbci.co.uk/news/world/rss.xml",

  "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",

  "https://www.aljazeera.com/xml/rss/all.xml",

  "https://rss.dw.com/xml/rss-en-all",

  "https://www.france24.com/en/rss"
];

export async function getLiveNews() {

  const allItems: any[] = [];

  for (const feed of FEEDS) {

    try {

      const rss =
        await parser.parseURL(feed);

      for (const item of rss.items) {

        allItems.push({
          source: rss.title,
          title: item.title,
          link: item.link,
          pubDate: item.pubDate
        });
      }

    } catch (err) {

      console.error(
        `Feed Failed: ${feed}`
      );

      console.error(err);
    }
  }

  console.log(
    `Collected ${allItems.length} articles`
  );

  return allItems.slice(0, 50);
}