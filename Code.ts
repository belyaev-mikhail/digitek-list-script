import tl = require("node-telegram-bot-api");

import gas = GoogleAppsScript;
import Sheet = GoogleAppsScript.Spreadsheet.Sheet;
import Message = tl.Message;
import shlex from "./shlex";

declare var BOT_TOKEN : string;
declare var SCRIPT_ID : string;

const SIG = "@digiteklist_bot";

function getSpreadsheetUrl() {
  return SpreadsheetApp.getActive().getUrl()
}

function trimHash(url: string) {
  // TODO: Is there a proper way to do it???
  return url.split("#")[0];
}

function formatDate(date) {
  return ("0" + date.getDate()).slice(-2) + "." + ("0" + (date.getMonth() + 1)).slice(-2) + "." + date.getYear()
}

function createNextDList() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var newListName = formatDate(new Date());

  if (SpreadsheetApp.getActiveSpreadsheet().getSheetByName(newListName) != null) return;

  var newSheet = sheet.copyTo(SpreadsheetApp.getActiveSpreadsheet()).setName(newListName);
  // remove all the actual records
  newSheet.getRange("A2:D44").clearContent();
  newSheet.getRange("L45").setValue(0);
  newSheet.getRange("M45").setFormula("'" + sheet.getName() + "'!N45");

  updateSummary()
  // we could protect the previous sheet and activate the new one here, but it may be inconvenient to use
}

interface SpreadsheetEdit {
    value: any,
    oldValue?: any,
    range: gas.Spreadsheet.Range
}

// onEdit is a global trigger that's invoked on every edit
function onEdit(e: SpreadsheetEdit) {
  if (!e.value) return; // do not trigger on delete
  if (e.oldValue) return; // do not trigger on typo edits

  // write date to column B if anything is edited in the same row and column B is empty
  if(2 <= e.range.getRow() && e.range.getRow() <= 44 &&
    1 <= e.range.getColumn() && e.range.getColumn() <= 4 && e.range.getColumn() != 2) {
      var dateCell = e.range.getSheet().getRange(e.range.getRow(), 2);
      if(!dateCell.getValue()) dateCell.setValue(new Date())
    }
  // create next page if row 44 is fully filled
  if (e.range.getRow() === 44 && e.range.getSheet().getRange("A44:D44").getValues()[0].every(it => !!it)) {
    createNextDList()
  }
}

function updateSummary() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  var summary = sheet.getSheetByName('Summary');
  var others = sheet.getSheets().filter(it => it.getName() !== summary.getName());

  var formula = `SORT({${others.map(it => `'${it.getName()}'!A2:D44`).join("; ")}}; 2; TRUE)`;

  summary.getRange("A2:A2").getCell(1,1).setFormula(formula)
}

function getLastSheet() {
  var result: Sheet;
  for (const it of SpreadsheetApp.getActiveSpreadsheet().getSheets()) {
    if(!it.getName().startsWith("DEBUG_") && it.getRange("A44").isBlank()) result = it
  }
  Logger.log(result.getName());
  return result
}

const getDebugSheet = () => SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DEBUG_TG_LOG");


function getLastRow() {
  var currentSheet = getLastSheet();
  var listArea = currentSheet.getRange("A2:A44");
  var i;
  for(i = 1; i <= listArea.getHeight(); ++i) {
    if(listArea.getCell(i, 1).isBlank()) return currentSheet.getRange("A" + (i + 1) + ":D" + (i + 1))
  }
  return undefined;
}

function insertStuff(who: string, what: string, howmuch: number) {
  var range = getLastRow();
  range.setValues([[who, new Date(), what, howmuch]]);
  if(range.getRow() === 44) createNextDList();
}

// telegram stuff!

const telegramUrl = () => `https://api.telegram.org/bot${BOT_TOKEN}`;
const webAppUrl = () => `https://script.google.com/macros/s/${SCRIPT_ID}/exec`;

function getMe() {
  var url = `${telegramUrl()}/getMe`;
  var response = UrlFetchApp.fetch(url);
  Logger.log(response.getContentText());
}

function setWebhook() {
  var url = `${telegramUrl()}/setWebhook?url=${webAppUrl()}`;
  var response = UrlFetchApp.fetch(url);
  Logger.log(response.getContentText());
}

function sendText(id: number, text: string) {
  var url = `${telegramUrl()}/sendMessage?chat_id=${id}&text=${encodeURI(text)}`;
  var response = UrlFetchApp.fetch(url);
  Logger.log(response.getContentText());
}

function sendPhoto(id: number, addr: string, caption: string) {
  var url = `${telegramUrl()}/sendPhoto?chat_id=${id}&photo=${addr}&caption=${encodeURI(caption)}`;
  var response = UrlFetchApp.fetch(url);
  Logger.log(response.getContentText());
}

function doGet(e) {
  return HtmlService.createHtmlOutput("Digitek list, alive and standing. Hello!");
}

var UNKNOWN = "__UNKNOWN_USER__";
var WHO_ARE_YOU = "https://i.imgur.com/pZSYRRW.jpg";

function doPost(e) {
  getDebugSheet().appendRow([e.postData.contents]);
  var data = JSON.parse(e.postData.contents) as tl.Update;
  if(data.message) {// there are non-message updates at hooks
      if(data.message.text.trim().indexOf('/dl') === 0) {
          data.message.text = data.message.text.replace('/dl', '').trim();
          handleMessage(data.message);
      }
      else if(data.message.chat.type === 'private') handleMessage(data.message);
  }
}

function validateInt(s: string): number {
    let p = parseInt(s, 10);
    if(p != p || p < 0) throw new Error(`${s} is not a positive integer`);
    return p
}

function handleMessage(m: Message) {
  var text = m.text.replace(SIG, "");
  var id = m.chat.id;
  var userId = m.from.id;

  sendText(id, "Думаю...");

  Logger.log("Message from " + userId + ":" + text);

  try {
    if (trimHash(text) === getSpreadsheetUrl()) {
      PropertiesService.getScriptProperties().setProperty(`telegramid#${userId}`, UNKNOWN)
      sendText(id, "Запомнил. Добавляй записи.");
      return
    }

    var splt = shlex(text);
    var whoAmI = PropertiesService.getScriptProperties().getProperty(`telegramid#${userId}`);

    if(splt.length < 2) {
      sendText(id, "Команда выглядит так: <кто> <что> <почём>");
      return;
    }

    if (!whoAmI) {
      sendPhoto(id, WHO_ARE_YOU, "Привет, незнакомец. Пришли мне правильную ссылку на таблицу и я тебя запомню.");
      return
    }

    if(splt.length < 3) {
      if(whoAmI == UNKNOWN) {
        sendText(id, "Кто ты? =(\nКоманда выглядит так: <кто> <что> <почём>");
        return;
      }
      sendText(id,`Понято, вставляю ${whoAmI} ${splt[0]} ${splt[1]}`);
      insertStuff(whoAmI, splt[0], validateInt(splt[1]));
    } else {
      whoAmI = splt[0];
      PropertiesService.getScriptProperties().setProperty(`telegramid#${userId}`, whoAmI);
      sendText(id,`Понято, вставляю ${whoAmI} ${splt[1]} ${splt[2]}`);
      insertStuff(whoAmI, splt[1], validateInt(splt[2]));
    }

  } catch(ex) {
    sendText(id, "Что-то пошло не так =(: " + ex)
  }

}
