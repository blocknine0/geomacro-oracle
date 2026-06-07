import { getLiveNews }
from "./collectors/live-news.js";

import { scoreHeadline }
from "./scoring/headline-score.js";

async function main() {

  const article =
    await getLiveNews();

  const result =
    scoreHeadline(
      article.title ?? ""
    );

  console.log(
    article.title
  );

  console.log(
    result
  );
}

main();