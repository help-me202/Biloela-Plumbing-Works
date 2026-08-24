const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const outputDirectory = path.join(projectRoot, "public");
const directories = ["HTML", "CSS", "Images"];

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });

for (const directory of directories) {
  const source = path.join(projectRoot, directory);
  const destination =
    directory === "HTML"
      ? outputDirectory
      : path.join(outputDirectory, directory);

  if (directory !== "HTML") {
    fs.cpSync(source, destination, { recursive: true });
    continue;
  }

  for (const file of fs.readdirSync(source)) {
    const sourceFile = path.join(source, file);
    const destinationFile = path.join(destination, file);
    const content = fs
      .readFileSync(sourceFile, "utf8")
      .replaceAll("../CSS/", "CSS/")
      .replaceAll("../Images/", "Images/");

    fs.writeFileSync(destinationFile, content);
  }
}

console.log("Static site built in public/");
