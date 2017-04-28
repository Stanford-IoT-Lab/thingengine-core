// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const ThingTalk = require('thingtalk');

const Config = require('../config');

const ChannelOpener = require('../apps/channel_opener');
const ExecEnvironment = ThingTalk.ExecEnvironment;

function throwCode(code, message) {
    var e = new Error(message);
    e.code = code;
    throw e;
}

module.exports = class RemoteExecutor {
    constructor(engine, permissions) {
        this._engine = engine;
        this._permissions = permissions;
    }

    installRule(principal, rule) {
        return this._permissions.isAllowedRule(principal, rule).then((allowed) => {
            if (!allowed)
                throwCode('EPERM', 'Permission denied');

            var assistant = platform.getCapability('assistant');
            if (!assistant)
                throwCode('ENOTSUP', 'Interaction not supported');
            var conversation = assistant.getConversation();
            if (!conversation)
                throwCode('EPERM', 'User not available to confirm');

            return conversation.handleParsedCommand(JSON.stringify(rule));
        });
    }

    execute(principal, device, channelType, channel, args) {
        var check;
        switch (channelType) {
        case 'action':
            check = this._permissions.isAllowedAction(principal, device, channel, args);
            break;
        case 'query':
            check = this._permissions.isAllowedQuery(principal, device, channel, args);
            break;
        case 'format-query':
            check = this._permissions.isAllowedFormatQuery(principal, device, channel, args);
            break;
        default:
            check = Q(false);
        }

        return check.then((allowed) => {
            if (!allowed)
                throwCode('EPERM', 'Permission denied');

            switch (channelType) {
            case 'action':
                return this._executeAction(principal, device, channel, args);
            case 'query':
                return this._executeQuery(principal, device, channel, args);
            case 'format-query':
                return this._executeFormatQuery(principal, device, channel, args);
            }
        });
    }

    _executeAction(principal, device, channel, args) {
        var opener = new ChannelOpener(this._engine, null, 'w', device, channel);

        return opener.start().then(() => {
            return Q.all(opener.values().map((ch) => {
                return ch.sendEvent(args);
            }));
        }).finally(() => opener.stop());
    }

    _executeFormatQuery(principal, device, channel, args) {
        var opener = new ChannelOpener(this._engine, null, 'w', device, channel);
        var env = new ExecEnvironment({}, this._engine.platform.locale, this._engine.platform.timezone);

        return opener.start().then(() => {
            return Q.all(opener.values().map((ch) => {
                env.currentChannel = ch;
                env.queryInput = [];
                env.queryValue = args;
                return env.formatEvent('messages');
            }));
        }).finally(() => opener.stop());
    }

    _executeQuery(principal, device, channel, args) {
        var opener = new ChannelOpener(this._engine, null, 'q', device, channel);

        return opener.start().then(() => {
            return Q.all(opener.values().map((ch) => {
                return ch.invokeQuery(args);
            }));
        }).finally(() => opener.stop()).then((results) => {
            var flattened = [];
            for (var result of results) {
                if (result.length > 10)
                    result = result.slice(0, 10);
                for (var row of result)
                    flattened.push(row);
            }

            return Q.all(flattened.map((row) => {
                return this._permissions.isAllowedQueryResult(principal, device, channel, args, row);
            })).then((mask) => {
                return flattened.filter((row, i) => mask[i]);
            });
        });
    }
}