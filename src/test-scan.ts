import { getLiveNews }
from "./collectors/live-news.js";

import { scoreHeadline }
from "./scoring/headline-score.js";

async function main() {

  const news =
    await getLiveNews();

  for (const item of news) {

    const result =
      scoreHeadline(
        item.title ?? ""
      );

    console.log(item.title);

    console.log(result);

    console.log("------");
  }
}

main();