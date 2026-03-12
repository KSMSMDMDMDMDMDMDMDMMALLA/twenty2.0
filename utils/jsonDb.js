const fs = require("fs");
const path = require("path");

class JsonDb {
  constructor(filePath, defaultData = {}) {
    this.filePath = filePath;
    this.defaultData = defaultData;
    this.ensureFile();
    this.data = this.read();
  }

  ensureFile() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(
        this.filePath,
        JSON.stringify(this.defaultData, null, 2),
        "utf-8"
      );
    }
  }

  read() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      return JSON.parse(raw);
    } catch (e) {
      return JSON.parse(JSON.stringify(this.defaultData));
    }
  }

  save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }

  reload() {
    this.data = this.read();
    return this.data;
  }
}

module.exports = { JsonDb };