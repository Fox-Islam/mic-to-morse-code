# mic-to-morse-code
Typescript module for converting microphone input into morse code

`npm install mic-to-morse-code`

[Demo repository](https://github.com/Fox-Islam/mic-to-morse-code-demo)

Simple usage example:
```javascript
const micToMorseCode = new MicToMorseCode(
    -50, // The audio level (dB) threshold
    50, // The time (ms) between between each microphone audio query
    0.2 // The time length (s) of a morse code "dot"
);
micToMorseCode.startMicrophone(); // This should only be called based on some user input (like a button press)
micToMorseCode.createListener("on:change", function (morseSentence) {
    // Called whenever the morse code string changes
    console.log(morseSentence);
});
```
