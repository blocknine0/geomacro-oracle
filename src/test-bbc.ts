import { getBBCNews } from "./collectors/bbc.js";

async function main() {
  const news = await getBBCNews();

  console.log(news[0]);
}

main().catch(console.error);