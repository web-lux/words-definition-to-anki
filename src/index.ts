import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import util from 'node:util';
import fs from 'fs';
import parse from 'node-html-parser';

const readFilePromise = util.promisify(fs.readFile);

const inputPath = 'files/input.txt';
const outputPath = 'files/output.txt';
const baseUrl = 'https://www.dicolink.com/mots/';

interface WordWithDefinitions {
    word: string;
    definitions: string[];
}

enum Sources {
    GRAND_DICTIONNAIRE = 0,
    LE_DICTIONNAIRE = 1,
    LE_LITTRÉ = 2,
    WIKITIONNAIRE = 3,
}

const rl = createInterface({
    input: stdin,
    output: stdout,
    terminal: false,
});

function quit() {
    console.log('Exiting...');
    rl.close();
    process.exit();
}

async function parseWordsFromInput(input: string) {
    const data = await readFilePromise(input, 'utf-8');
    return data.split(/\r?\n/).map((word) => word.trim());
}

async function fetchPage(word: string) {
    const res = await fetch(baseUrl + word);
    if (!res.ok) {
        throw new Error(`${res.status} - ${res.statusText}`);
    }
    return res.text();
}

async function fetchAllPages(words: string[]) {
    return Promise.all(
        words.map((word) => {
            return fetchPage(word);
        })
    );
}

function checkIfDefinitionsFound(definitions: string[]) {
    // Even when no definition is found in a dictionnary, it still appears on the page with the ul containing a single li with a generic "no def found text". So we have to check for that.
    const noDefsFoundString = 'pas de définition ';
    return definitions[0] !== noDefsFoundString;
}

function getDefinitionsFromHtml(html: string, word: string) {
    const root = parse(html);
    const ulElements = root.querySelectorAll('h3.source + ul');
    if (!ulElements.length) throw new Error(`No definitions found for ${word}`);
    // No target elements = the word wasn't found. We can stop here.

    ulElements.splice(Sources.LE_LITTRÉ, 1);
    // Filter out Le Littré.

    const definitionsFromAllSources = ulElements.map((ul) => {
        const liElements = ul.querySelectorAll('li');
        const definitions = liElements.map((li) => {
            return li.text.trimEnd();
        });
        return definitions;
    });

    const definitions = definitionsFromAllSources.find(checkIfDefinitionsFound);
    // We return the first array of definitions found. Sometimes, the Grand Dictionnaire doesn't have one, for example, so we send back the next best thing, definitions from Le Dictionnaire.

    if (!definitions) throw new Error('Error with checkIfDefinitionsFound');

    return definitions;
}

function generateOuput(wordWithDefinitions: WordWithDefinitions) {
    const word = wordWithDefinitions.word;
    const definitions = wordWithDefinitions.definitions;
    const li = definitions.map((definition) => {
        return `<li>${definition}</li>`;
    });
    return `${word}\t <ol>${li.join('')}</ol>`;
}

async function startProgram() {
    console.log("Hi! I'll begin by parsing your input file.");
    const words = await parseWordsFromInput(inputPath);
    let currentUserInput = await rl.question(`[ ${words.join(', ')} ] Find the definitions of these words ? Type y to continue. `);
    if (currentUserInput !== 'y') quit();
    console.log('Fetching relevant pages...');
    const rawPages = await fetchAllPages(words);
    console.log('Now parsing pages for definitions...');
    const definitions = rawPages.map((page, index) => {
        return getDefinitionsFromHtml(page, words[index]);
    });
    const wordsWithDefinitions = words.map((word, index) => {
        return { word, definitions: definitions[index] };
    });
    fs.writeFileSync(outputPath, wordsWithDefinitions.map((word) => generateOuput(word)).join('\n'));
    console.log('done!');
}

try {
    startProgram();
} catch (error) {
    console.error(error);
    quit();
}
