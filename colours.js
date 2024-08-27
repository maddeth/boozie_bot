import { promises as fs } from 'fs';
import { odata, TableClient, AzureNamedKeyCredential } from "@azure/data-tables";

const account = JSON.parse(await fs.readFile('./secret.json', 'utf-8')).tableAccount;
const accountKey = JSON.parse(await fs.readFile('./secret.json', 'utf-8')).tableAccountKey;

const azureTableEndpoint = "https://" + account + ".table.core.windows.net/";
const azureTableCredential = new AzureNamedKeyCredential(account, accountKey);
const colourTableName = "colours";
const colourTableClient = new TableClient(azureTableEndpoint, colourTableName, azureTableCredential);


export let coloursRowCount = parseInt(await getRowCount(colourTableClient), 10)

console.log(`setting number of rows for colours db to ${coloursRowCount}`)

async function getRowCount(tableClient) {
  let rowList = []
  let entities = tableClient.listEntities();
  for await (const entity of entities) {
    rowList.push(entity.RowKey)
  }
  return rowList.length
}

async function dbGetAllColours() {
  let colourMap = []
  let colourObject = {}
  let entities = colourTableClient.listEntities();
  for await (const entity of entities) {
    colourObject = { Name: entity.colourName, Hex: entity.hexCode }
    colourMap.push(colourObject)
  }
  return colourMap
}

export async function dbGetRandomColourByName(colourName) {
  let colourMap = await dbGetAllColours();
  let filtered = colourMap.filter(colour => colour.Name.toLowerCase().includes(colourName));
  if (filtered.length > 0) {
    let randomColour = filtered[Math.floor(Math.random() * filtered.length)]
    return randomColour.Hex;
  }
  return false;
}

export async function dbGetAllColoursCall() {
  let colourMap = await dbGetAllColours();
  return JSON.stringify(colourMap)
}

export async function dbGetHex(event) {
  let entities = colourTableClient.listEntities({
    queryOptions: { filter: odata`colourNameSanitised eq ${event.replace(/\s/g, '').toLowerCase()}` }
  });

  for await (const entity of entities) {
    console.log(`${entity.hexCode}`);
    return entity.hexCode
  }
}

export async function dbGetColourByHex(hexCode) {
  let entities = colourTableClient.listEntities({
    queryOptions: { filter: odata`hexCode eq ${hexCode.replace(/#/g, '').toLowerCase()}` }
  });
  let colourList = []

  for await (const entity of entities) {
    colourList.push(entity.colourName)
  }
  if (colourList.length > 0) {
    return "\"" + colourList.join("\", \"") + "\""
  } else {
    return false
  }
}

export async function dbGetColour(id) {
  let entity = await colourTableClient.getEntity("colour", id);
  return "\"" + entity.colourName + "\":\"" + entity.hexCode + "\""
}

export async function dbAddColour(colourName, colourHex) {
  const colourHexSanitised = colourHex.replace(/#/g, '').toLowerCase()
  const partitionKey = "colour";
  const colourNameSanitised = `${colourName.replace(/\s/g, '').toLowerCase()}`
  let row = coloursRowCount + 1
  console.log(`adding row ${row} and colour/hex/sanitised: ${colourName}/${colourHexSanitised}/${colourNameSanitised}`)
  const entity = {
    partitionKey: partitionKey,
    rowKey: `${row}`,
    colourName: colourName,
    hexCode: colourHexSanitised,
    colourNameSanitised: colourNameSanitised
  };
  await colourTableClient.createEntity(entity);
  coloursRowCount = row
}