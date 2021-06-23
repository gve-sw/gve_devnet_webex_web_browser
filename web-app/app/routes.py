#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Copyright (c) 2021 Cisco and/or its affiliates.
This software is licensed to you under the terms of the Cisco Sample
Code License, Version 1.1 (the "License"). You may obtain a copy of the
License at
               https://developer.cisco.com/docs/licenses
All use of the material herein must be in accordance with the terms of
the License. All rights not expressly granted by pytthe License are
reserved. Unless required by applicable law or agreed to separately in
writing, software distributed under the License is distributed on an "AS
IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
or implied.
"""


__author__ = "Josh Ingeniero <jingenie@cisco.com>"
__copyright__ = "Copyright (c) 2021 Cisco and/or its affiliates."
__license__ = "Cisco Sample Code License, Version 1.1"



import logging

from flask import render_template, redirect, url_for, request, session

from DETAILS import *
from app import app

import urllib3
import pprint

import jwt
import base64
import requests
from datetime import datetime, timezone, timedelta

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
pp = pprint.PrettyPrinter(indent=2)
logging.basicConfig(filename='app.log', filemode='a', format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


# Login screen
@app.route('/join/<meeting>', methods=['GET', 'POST'])
def login(meeting):
    if request.method == 'GET':
        return render_template('login.html', title='Log In', meeting=meeting)

    elif request.method == 'POST':
        session['details'] = request.form
        session['meeting'] = meeting
        return redirect(url_for('meet'))


# Meeting
@app.route('/meet', methods=['GET', 'POST'])
def meet():
    details = session['details']
    name = details['name']
    email = details['email']
    meeting = session['meeting']
    dt = datetime.utcnow() + timedelta(hours=24)
    timestamp = dt.replace(tzinfo=timezone.utc).timestamp()
    timestamp = int(timestamp)
    data = {
        "sub": f"dbs-{name}-{timestamp}",
        "name": f"{name} - {email}",
        "iss": f"{ISSUER}",
        "exp": timestamp
    }
    token = jwt.encode(data, base64.b64decode(SECRET), algorithm="HS256")
    url = "https://webexapis.com/v1/jwt/login"
    payload = {}
    headers = {
        'Authorization': f'{token}'
    }

    response = requests.request("POST", url, headers=headers, data=payload)

    token = response.json()['token']
    print(token)
    return render_template('index.html', title='Welcome', details=details, meeting=meeting, token=token)


# Bye screen
@app.route('/bye/', methods=['GET', 'POST'])
def bye():
    return render_template('bye.html', title='Thank you!')


# Webex
@app.route('/webex', methods=['GET', 'POST'])
def webex():
    return render_template('webex.html', title='Webex Test')

