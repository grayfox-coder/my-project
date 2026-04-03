module.exports = {
  "input": "src",
  "output": "dist",
  "plugins": [
    {
      "name": "pretext-plugin-html",
      "options": {
        "template": "src/index.html",
        "filename": "index.html"
      }
    }
  ]
};