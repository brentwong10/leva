from flask import Flask, render_template, request, jsonify, url_for, abort
from flaskwebgui import FlaskUI
from werkzeug.utils import secure_filename
from flask_socketio import SocketIO, emit
from engineio.async_drivers import gevent
import webbrowser
import json
import feather
import shutil

import os
import re
from tika import parser

import sqlite3
import pandas as pd

import spacy
import time

#path to upload and feather
UPLOAD_FOLDER = './uploads'
FEATHER_PATH='history.feather'

#database setting
DB_PATH="./database/"
DB_DEFAULT=DB_PATH+ "fyp_default.db"
DB_BACKUP=DB_PATH+ "fyp_backup.db"
DB_CURRENT=DB_PATH+ "fyp.db"

app =Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
socketio = SocketIO(app, async_mode='gevent')
ui= FlaskUI(app)

pos_area = {"VERB": ["VB", "VBD", "VBG", "VBN", "VBP", "VBZ"], "NOUN": ["NN", "NNS", "NNP", "NNPS"], "ADJECTIVE":["JJ", "JJR", "JJS"], "ADVERB":["RB", "RBR", "RBS"]}
dep_area= {"subj": ["nsubj"], "obj":["dobj", "pobj"]}
nlp=spacy.load("en_core_web_sm")

#create a blank db if not exist
def InitDB():
    conn= sqlite3.connect(DB_CURRENT)
    c= conn.cursor()

    article_sql = "CREATE TABLE IF NOT EXISTS articles (article_id INTEGER PRIMARY KEY, name TEXT NOT NULL)"
    sentence_sql = "CREATE TABLE IF NOT EXISTS sentences (sentence_id INTEGER PRIMARY KEY, sentence TEXT NOT NULL,  article_id INTEGER NOT NULL, pos TEXT NOT NULL, dep TEXT NOT NULL, base TEXT NOT NULL, wordlist TEXT NOT NULL)"
    word_sql = "CREATE TABLE IF NOT EXISTS words (pair TEXT PRIMARY KEY, source INTEGER NOT NULL, count INTEGER NOT NULL)"

    c.execute(article_sql)
    c.execute(sentence_sql)
    c.execute(word_sql)
InitDB();

def Emit(response, data):
    socketio.emit(response, data)
    socketio.sleep(0.01) #generate a thread to emit the message

@app.route("/")
def index():
    return render_template("index.html")

def search(keywords, result_pos, threshold, ignore_word, keywords_pos, keywords_dep):
    start_time = time.clock()
    conn= sqlite3.connect(DB_CURRENT)
    c= conn.cursor()

    temp= keywords
    tmp={}
    counter=0

    keywords = ["'% {0} %'".format(keyword) for keyword in keywords if keyword !=""]     # remove if some keywords contain null string

    keywords = " AND sentence LIKE ".join(keywords)     #join keywords by like
    sql =   "SELECT sentence_id, sentence, name, pos, dep, base, wordlist \
            FROM articles, sentences \
            WHERE wordlist LIKE "+keywords+" and articles.article_id= sentences.article_id"

    c.execute(sql)
    rows = c.fetchall()

    columns = ['source', 'base', 'concrete', 'pos', 'sid']     #sentence, base form, exact words, pos tag, sentence id

    for row in rows:
        doc= nlp(row[1])
        posList= row[3].split(" ")
        depList= row[4].split(" ")
        baseList= row[5].split(" ")
        wordList = row[6].split(" ")

        flag=True
        for j in range(len(temp)):
            indices = [i for i, x in enumerate(wordList) if x == temp[j]] #get index of search-keyword
            for k in indices:
                if (keywords_pos[j]!="all"):
                    if (posList[k] not in pos_area[keywords_pos[j]]):
                        flag=False
                        break
                if (keywords_dep[j]!="all"):
                    if (depList[k] not in dep_area[keywords_dep[j]]):
                        flag=False
                        break
            if (flag==False):
                break
        if (flag==False):
            continue

        #phrasal word
        if (result_pos=="PVERB"):
            phrsVerb= set()
            proc = nlp(row[1])

            for token in proc:
                if token.dep_ == "prt" and token.head.pos_ == "VERB":
                    verb = token.head.orth_
                    part = token.orth_
                    phrsVerb.add("{0} {1}".format(verb,part))

            phrsVerb= list(phrsVerb)
            for i in range(len(phrsVerb)):
                tmp[counter]= {columns[0]: row[2], columns[1]: phrsVerb[i], columns[2]: phrsVerb[i], columns[3]: "Phrasal Verb", columns[4]: row[1]}
                counter=counter+1
        #non phrasal word
        else:
            indexList= [i for i, x in enumerate(posList) if x in pos_area[result_pos]]
            if (len(indexList)>0):
                for i in indexList:
                    tmp[counter]= {columns[0]: row[2], columns[1]: baseList[i], columns[2]: wordList[i], columns[3]: posList[i], columns[4]: row[1]}
                    counter=counter+1

    #return null if no record matched
    if (len(tmp)==0):
        return []

    resultList= pd.DataFrame.from_dict(tmp, "index")
    resultList= resultList[resultList.base.str.isalpha()] #filter out non-alpha result

    feather.write_dataframe(resultList, FEATHER_PATH)

    resultList= resultList.loc[~resultList.concrete.isin(ignore_word.split(",")+temp)]
    resultList=resultList.groupby('base').size().reset_index(name='count').sort_values(by='count', ascending=False)

    return resultList[resultList['count']>threshold].to_dict(orient='records')

def parsing(filepath, ignore, response, count=0, total=5):
    Emit('import_single_process_response', {'data': "Parsing Content of File {}".format(count + 1), "code": count*3+2, "total": total})

    parsedPDF = parser.from_file(filepath)
    pdf = parsedPDF["content"]

    Emit(response, {'data': "Removing Uneccessary Spaces of File {}".format(count + 1), "code": count*3+3, "total": total})

    pdf = re.sub('\n+', '\n', pdf)
    pdf = re.sub('\n', ' ', pdf)
    pdf = re.sub('- ', '', pdf)

    temp=[]
    doc = nlp(pdf)

    Emit(response, {'data': "Cutting into sentences of File {}".format(count + 1), "code": count*3+4, "total": total})

    if (ignore):
        for sent in doc.sents:
            if sent[0].is_title and sent[-1].is_punct:
                has_noun = 2
                has_verb = 1
                for token in sent:
                    if token.pos_ in ["NOUN", "PROPN", "PRON"]:
                        has_noun -= 1
                    elif token.pos_ == "VERB":
                        has_verb -= 1
                if has_noun < 1 and has_verb < 1:
                    temp.append([False, sent.text.strip()])
                else:
                    temp.append([True, sent.text.strip()])
            else:
                temp.append([True, sent.text.strip()])
    else:
        for sent in doc.sents:
            temp.append([False, sent.text.strip()])

    Emit(response , {'data': "Finished", "code": 5, "total": 5})

    return temp

@app.route('/search/word', methods=['POST'])
def searchWord():
    keywords = request.form.getlist('keyword')
    keywords_pos = request.form.getlist('keyword-pos')
    keywords_dep = request.form.getlist('keyword-dep')
    keywords = request.form.getlist('keyword')
    result_pos = request.form['result-pos']
    threshold = 0 if request.form['threshold']=="" else int(request.form['threshold'])
    ignore_word = request.form['ignore_word']

    searchList = search(keywords, result_pos, threshold, ignore_word, keywords_pos, keywords_dep)

    return jsonify({"count": len(searchList), "wordList":searchList})

@app.route('/search/wordDetail', methods=['POST'])
def getWordDetail():
    keyword = request.form['keyword']

    resultList = feather.read_dataframe(FEATHER_PATH)
    resultList = resultList.groupby(['source', 'base', 'concrete', 'pos'])['sid'].agg(set).agg(tuple).reset_index().groupby(['base','concrete']).agg(list).reset_index()
    targetDF= resultList[resultList['base']==keyword].to_dict(orient='records')

    return jsonify({"wordDetail":targetDF})

@app.route('/open/single', methods=['POST'])
def openSingle():

    response= 'import_single_process_response'
    Emit(response, {'data': "Initializing Parser", "code": 1, "total": 5})

    if 'pdf' in request.files:
        pdf=request.files['pdf']
        ignore= (True if 'auto_ignore' in request.form else False)
        filename = secure_filename(pdf.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        pdf.save(filepath)

        try:
            result= parsing(filepath, ignore, response)

            return jsonify({"result": result})

        except:
            Emit('import_single_process_response', {'data': "Error. Please try again", "code": -1, "total": 0})

    else:
        Emit(response, {'data': "Invalid file format", "code": -1, "total": 0})

    return jsonify({"response": "ok"})

@app.route('/open/multiple', methods=['POST'])
def openMultiple():

    if 'pdf-multi' in request.files:
        result={}
        count=0
        uploaded_files = request.files.getlist("pdf-multi")
        ignore= (True if 'auto_ignore' in request.form else False)
        no_of_file= len(uploaded_files)

        response= 'import_multi_process_response'
        Emit(response, {'data': "Initializing Parser", "code": 1, "total": no_of_file*3+2})

        for i in uploaded_files:
            filename = secure_filename(i.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            # if (os.path.exists(filepath)):
            i.save(filepath)

            try:
                temp= parsing(filepath, ignore, response, count=count, total=no_of_file*3+2)

                result[secure_filename(i.filename)]= temp

            except:
                result["(Error) "+ i.filename]=[]
            finally:
                count+=1

        Emit(response, {'data': "Finished", "code": no_of_file*3+2, "total": no_of_file*3+2})

        return jsonify({"result": result})

    else:
        Emit(response, {'data': "Invalid file format", "code": -1, "total": 0})

    return jsonify({"response": "ok"})

@app.route('/import/file', methods=['POST'])
def importFile():
    conn= sqlite3.connect(DB_CURRENT)
    c= conn.cursor()

    lines= request.form.getlist('tb')

    article_index = c.execute("SELECT count(*) FROM articles").fetchone()[0]+1
    filename= request.form['filename']
    filename= filename.split('.')[0]

    sql ="INSERT INTO articles (name) VALUES (?)"
    c.execute(sql, [filename])

    for i in lines:
        if (len(i) ==0 or i.isspace()):
            continue
        doc = nlp(i)

        sql ="INSERT INTO sentences (sentence, pos, dep, base, wordlist, article_id) VALUES (?, ?, ?, ?, ?, ?)"

        pos= (" ".join(j.tag_ for j in doc))
        dep= (" ".join(j.dep_ for j in doc))
        base= (" ".join(j.lemma_ for j in doc))
        wordlist=(" ".join(j.text.lower() for j in doc))

        c.execute(sql, [i, pos, dep, base, wordlist, article_index])
    conn.commit()
    return jsonify(success=True)

@app.route('/database/clean', methods=['DELETE'])
def CleanDB():
    try:
        conn= sqlite3.connect(DB_CURRENT)
        c= conn.cursor()
        c.execute("DELETE FROM articles")
        c.execute("DELETE FROM sentences")
        c.execute("DELETE FROM words")
        conn.commit()

        return jsonify(success=True)
    except:
        abort(400)

@app.route('/database/scan', methods=['POST'])
def scanDB():
    table = request.json['table']
    limit = request.json['limit']
    offset = request.json['offset']
    conn= sqlite3.connect(DB_CURRENT)
    c= conn.cursor()
    c.execute("SELECT COUNT(*) from {}".format(table))
    count= c.fetchone()[0]
    c.execute("SELECT * FROM {} LIMIT {} OFFSET {}".format(table, limit, offset))
    result = c.fetchall()

    return jsonify({"count":count, "result": result})

@app.route('/database/update', methods=['POST'])
def updateDB():
    id = request.form['article-id']
    filename = request.form['article-new-name']

    conn= sqlite3.connect(DB_CURRENT)
    c= conn.cursor()

    c.execute("Update articles set name= ? where article_id= ?", [filename, id])
    conn.commit()

    return jsonify(success=True)

@app.route('/shutdown', methods=['GET'])
def shutdown():
    shutdown_server()
    return 'Server shutting down...'

@app.route('/database/restoreBackup', methods=['GET'])
def RestoreDBByBackup():
    try:
        shutil.copyfile(DB_BACKUP, DB_CURRENT)
        return jsonify(success=True)
    except:
        abort(400)

@app.route('/database/rewriteBackup', methods=['GET'])
def RewriteBackup():
    try:
        shutil.copyfile(DB_CURRENT, DB_BACKUP)
        return jsonify(success=True)
    except:
        abort(400)

@app.route('/database/delete', methods=['POST'])
def deleteRecord():
    table = request.json['table']
    rid= request.json['id']
    try:
        conn= sqlite3.connect(DB_CURRENT)
        c= conn.cursor()
        if (table == "articles"):
            c.execute("DELETE FROM sentences WHERE article_id = {}".format(rid))
            c.execute("DELETE FROM articles WHERE article_id = {}".format(rid))
        elif (table == "sentences"):
            c.execute("DELETE FROM sentences WHERE sentence_id = {}".format(rid))
        conn.commit()
        return jsonify(success=True)
    except:
        abort(400)


@app.route('/database/restoreDefault', methods=['GET'])
def RestoreDBByDefault():
    try:
        shutil.copyfile(DB_DEFAULT, DB_CURRENT)
        return jsonify(success=True)
    except:
        abort(400)

if __name__ == '__main__':
    socketio.run(app)