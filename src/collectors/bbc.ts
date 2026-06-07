import Parser from "rss-parser";

const parser = new Parser();

export async function getBBCNews() {
  const feed = await parser.parseURL(
    "https://feeds.bbci.co.uk/news/world/rss.xml"
  );

  return feed.items.slice(0, 5);
}