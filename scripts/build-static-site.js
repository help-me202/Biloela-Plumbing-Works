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

// Copy the client-side form scripts so deployed pages can load them.
// server.js and gas-email-template.js are backend-only and stay private.
const serverOnlyScripts = new Set(["server.js", "gas-email-template.js"]);
const jsonSource = path.join(projectRoot, "JSON");
const jsonDestination = path.join(outputDirectory, "JSON");
fs.mkdirSync(jsonDestination, { recursive: true });

for (const file of fs.readdirSync(jsonSource)) {
  if (!file.endsWith(".js") || serverOnlyScripts.has(file)) continue;
  fs.copyFileSync(path.join(jsonSource, file), path.join(jsonDestination, file));
}

// Copy the Google Search Console verification file to the site root.
const verificationFile = "google8e965ac1e033e153.html";
const verificationSource = path.join(projectRoot, verificationFile);
if (fs.existsSync(verificationSource)) {
  fs.copyFileSync(verificationSource, path.join(outputDirectory, verificationFile));
}

console.log("Static site built in public/");
