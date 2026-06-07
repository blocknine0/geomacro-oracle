import { getLiveNews }
from "./collectors/live-news.js";

async function main() {

  const news =
    await getLiveNews();

  console.log(
    `Articles: ${news.length}`
  );

  console.log(
    news.slice(0, 10)
  );
}

main();