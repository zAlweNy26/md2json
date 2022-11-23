import fs from 'fs'
import readline from 'readline'
import _ from 'lodash'

// https://chubakbidpaa.com/interesting/2021/09/28/regex-for-md.html

const readInterface = readline.createInterface({
    input: fs.createReadStream('./input/Test.md'),
})

let observe = (obj, fn) => new Proxy(obj, {
    set(obj, key, val) {
        obj[key] = val
        fn(obj)
        return true
    }
})

const indentSpaces = 2
const keepHorizontalRule = true
const replaceBasicStyle = true

String.prototype.isTable = function () { return /^[|]/g.test(this) }
String.prototype.isHeader = function () { return /^[#]/g.test(this) }
String.prototype.headerType = function () { return this.isHeader() ? (this.match(/#/g) || []).length : 0 }
String.prototype.isHorizontalRule = function () { return /^(\*|\_|\-)\1{2,}/g.test(this) }
String.prototype.isList = function () { return /^(\-|\*|\+)\1{0}\s/g.test(this) || /^(\d+.\s)/g.test(this) }
String.prototype.isNormal = function () { return !(this.isTable() || this.isHeader() || this.isList()) }
String.prototype.nestLevel = function () { return this.match(/^\s*/g)[0].length / indentSpaces }
String.prototype.toHtml = function () {
    return replaceBasicStyle && !this.isHorizontalRule() ? this
        .replace(/!\[([^\]]*)\]\((.*?)(?:(?:\s"|')(.*)+(?:"|'))?\)/g, "<img alt='$1' title='$3' src='$2' />")
        .replace(/\[([^\]]*)\]\((.*?)(?:(?:\s"|')(.*)+(?:"|'))?\)/g, "<a href='$2' alt='$3'>$1</a>")
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/(\\n)/g, "<br/>")
        .replace(/(\*\*|__)(?=\S)([^\r]*?\S)\1/g, "<strong>$2</strong>")
        .replace(/(\*|_)(?=\S)([^\r]*?\S)\1/g, "<em>$2</em>")
        .replace(/(\~\~)(?=\S)([^\r]*?\S)\1/g, "<s>$2</s>") : this
}

let jsonOutput = [], nestList = [], tableObj = {}
let lastKey = '[0]', prevLine = "", currLine = ""
let headerType = 0, contentCount = 0, tableCount = 0
let headersCount = observe([], arr => {
    contentCount = tableCount = 0
    nestList = []
})

const updateOrAddInArray = (arr, index, value, add = false) => {
    if (arr[index] === undefined) arr.push(value)
    else arr[index] = add ? arr[index] + value : value
}

// Aggiungere blocchi di codice, blocchi di quotes
readInterface.on('line', line => {
    line = line.replace(/^(>)+\s?/g, '')
    headerType = line.trim().isHeader() ? (line.trim().match(/#/g) || []).length : 0
    line = headerType > 0 ? line.trim().replace(/#/g, '').trim() : line
    if (line != '' && (keepHorizontalRule || !line.trim().isHorizontalRule())) {
        prevLine = currLine
        currLine = line
        if (headerType > 0) {
            updateOrAddInArray(headersCount, headerType - 1, 1, true)
            let nestHeaders = headersCount.map((v, i) => i > headerType - 1 ? 0 : v)
            lastKey = nestHeaders.slice(0, headerType).map(v => `[${v - 1}]`).join('.children.')
            _.set(jsonOutput, lastKey, { title: line.trim(), content: [], children: [] })
        } else {
            if (line.trim().isList()) {
                updateOrAddInArray(nestList, line.nestLevel(), 1, true)
                let sliceNest = line.nestLevel() > 0 ? line.nestLevel() + 1 : 1
                nestList = nestList.map((v, i) => i > line.nestLevel() ? 0 : v)
                if (prevLine.nestLevel() < line.nestLevel()) nestList[prevLine.nestLevel()] += 1
                let listKey = nestList.slice(0, sliceNest).map(v => `[${v - 1}]`).join('.')
                let cleanLine = line.trim().replace(/^(\-|\*|\+)\1{0}\s/g, '').trim().toHtml()
                _.set(jsonOutput, `${lastKey}.content.[${contentCount}].${listKey}`, cleanLine)
            } else if (line.isTable()) {
                let currentRow = line.split('|').filter(v => v != '').map(v => v.trim().toHtml())
                if (!prevLine.isTable() && tableCount == 0) {
                    tableObj = {}
                    currentRow.forEach(v => tableObj[v] = "")
                    tableCount++
                } else if (!currentRow.every(v => /(-)+(:)?/.test(v))) {
                    let rowObj = {}
                    Object.keys(tableObj).forEach((key, i) => rowObj[key] = currentRow[i])
                    _.set(jsonOutput, `${lastKey}.content.[${contentCount}].[${tableCount++ - 1}]`, rowObj)
                }
            } else {
                if (!prevLine.trim().isNormal()) contentCount++
                _.set(jsonOutput, `${lastKey}.content.[${contentCount++}]`, line.trim().toHtml())
                nestList = []
                tableCount = 0
            }
        }
    }
})

const noNull = (v) => {
    if (v && typeof v === 'object' && Array.isArray(v.children)) v.children = v.children.filter(noNull)
    return v !== null
}

readInterface.on('close', () => {
    const output = JSON.stringify(jsonOutput.filter(noNull), null, 2)
    fs.writeFile('./output/output.json', output, err => {
        if (err) console.error(err)
        console.log("Done!")
    })
})