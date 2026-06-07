import Parser from "rss-parser";

const parser = new Parser();

export async function getReutersNews() {

  const feed =
    await parser.parseURL(
      "https://www.reutersagency.com/feed/?best-topics=world&post_type=best"
    );

  return feed.items.slice(0, 5);
}