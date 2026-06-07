import { getReutersNews } from "./collectors/reuters.js";

async function main() {

  const news =
    await getReutersNews();

  console.log(news[0]);

}

main();