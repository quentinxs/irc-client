#!/usr/bin/env node

var express = require('express'),
	app = express.createServer(), 
	io = require('socket.io').listen(app), 
	irc = require('irc');

app.listen(8081);
io.enable('browser client minification');
io.enable('browser client etag');
io.enable('browser client gzip');
io.set('log level', 1)

app.get('/', function (req, res) {
	res.sendfile(__dirname + '/client.html');
});
app.get('/client.css', function (req, res) {
	res.sendfile(__dirname + '/client.css');
});

app.use("/images", express.static(__dirname + '/images'));

var user = '';
io.sockets.on('connection', function (socket) {
	var client = new irc.Client('irc.freenode.net', 'webuser', {
		userName: 'alpha',
		realName: 'web user test',
		channels: ['#nodejs-test'],
		debug: false,
		autoConnect: false
	});

	socket.on('credentials', function (cred) {
		client.nick = cred.nick;
		user = cred.nick;
		client.connect();
	});

	client.on('registered', function() {
		if (user !== client.nick)
			socket.emit('registered', client.nick);
	});
	
	client.addListener('topic', function(channel, topic, nick, message) {
		socket.emit('event', {"eventType": 'topic', "channel": channel, "topic": topic, "nick": nick, "msg": message});
	});
	
	client.addListener('notice', function(from, to, message) {
		if (from) socket.emit('notice', {"from": from, "to": to, "msg": message});
	});
	client.addListener('message', function (from, to, message) {
		var action = false,
			ctcprequest = false;
		if (match = message.match(/^\u0001ACTION (.*)\u0001/)) {
			message = match[1];
			action = true;
		} else if (match = message.match(/^\u0001([A-Z]+|ERRMSG .*)\u0001/)) {
			var request = match[1],
				query = '';
			ctcprequest = true;
			if (match = request.match(/ERRMSG (.*)/)) {
				request = 'ERRMSG';
				query = match[1];
			}
			switch (request) {
				case 'ERRMSG':
					client.send('NOTICE',from,'\u0001ERRMSG '+query+' :No error has occurred\u0001');
				case 'TIME':
					var now = new Date(),
						year = now.getFullYear(),
						month = String("00" + (now.getMonth()/1+1)).slice(2),
						day = String("00" + now.getDate()).slice(2),
						hour = String("00" + now.getHours()).slice(2),
						minute = String("00" + now.getMinutes()).slice(2),
						second = String("00" + now.getSeconds()).slice(2),
						offset = -now.getTimezoneOffset()/60*100,
						datetime = year+'-'+month+'-'+day+' '+hour+':'+minute+':'+second+' '+offset;
					client.send('NOTICE',from,'\u0001TIME :'+datetime+'\u0001'); //format \001TIME :human-readable-datetime\001
					break;
				case 'USERINFO':
					client.send('NOTICE',from,'\u0001USERINFO :Web User\u0001'); //format \001USERINFO :client-set-string\001
					break;
				case 'VERSION':
					client.send('NOTICE',from,'\u0001VERSION node-irc 0.8.7 Linux\u0001'); //format \001VERSION client:version:environment\001
					break;
				default:
					// for CLIENTINFO, FINGER, PING, SOURCE, and unknown requests
					client.send('NOTICE',from,'\u0001ERRMSG '+request+' :Query is unknown\u0001');
			}
		}
		if (!ctcprequest) socket.emit('message', {"from": from, "to": to, "action": action, "msg": message});
	});
	client.addListener('join', function(channel, who) {
		socket.emit('event', {"eventType": 'join', "channel": channel, "who": who});
		console.log('%s has joined %s', who, channel);
		if (who !== client.nick) client.send('NAMES', channel);
	});
	client.addListener('kick', function(channel, who, by, reason) {
		socket.emit('event', {"eventType": 'kick', "channel": channel, "who": who, "by": by, "reason": reason});
		console.log('%s was kicked from %s by %s: %s', who, channel, by, reason);
		if (who !== client.nick) client.send('NAMES', channel);
	});
	client.addListener('names', function(channel, nicks) {
		socket.emit('userlist', {"channel": channel, "nicks": nicks});
		console.log('= %s %s', channel, nicks);
	});
	client.addListener('nick', function(oldnick, newnick, channels) {
		if (oldnick === client.nick) client.nick = newnick;
		socket.emit('event', {"eventType": 'nick', "oldnick": oldnick, "newnick": newnick, "channels": channels});
		console.log('%s is now known as %s', oldnick, newnick);
		for (i = 0; i < channels.length; i++) {
			channel = channels[i]
			if (client.opt.channels.indexOf(channel) != -1) {
				client.send('NAMES', channel);
			}
		}
	});
	client.addListener('part', function(channel, who) {
		socket.emit('event', {"eventType": 'part', "channel": channel, "who": who});
		console.log('%s has left %s', who, channel);
		if (who !== client.nick) client.send('NAMES', channel);
	});
	client.addListener('quit', function(who, reason, channels) {
		socket.emit('event', {"eventType": 'quit', "who": who, "reason": reason, "channels": channels});
		console.log('%s has quit. (%s)', who, reason);
		for (i = 0; i < channels.length; i++) {
			channel = channels[i]
			if (client.opt.channels.indexOf(channel) != -1) {
				client.send('NAMES', channel);
			}
		}
	});
	socket.on('data', function (data) {
		if (data.line.match(/^[^/]/)) {
			client.say(data.to, data.line);
		} else if (data.line.match(/^\/([A-Za-z]+)(?: (.*))?/)) {
			match = data.line.match(/^\/([A-Za-z]+)(?: (.*))?/);
			command = match[1].toUpperCase();
			args = match[2];
			if (command === 'J') command = 'JOIN';
			switch (command) {
				case 'AWAY':
					client.send('AWAY',args);
					break;
				case 'DEOP':
					break;
				case 'DEVOICE':
					break;
				case 'JOIN':
					match = args.replace(/([^,])\s/,RegExp.$1+"\t").split(/\t/);
					channels = [];
					chanlist = match[0].replace(', ',',').split(',');
					console.log(chanlist);
					for (var i = 0; i < chanlist.length; i++) {
						if(chanlist[i].match(/([#&+!].*)/))
							channels.push(chanlist[i]);
					}
					if (match.length > 1) {
						keys = match[1].replace(', ',',');
						client.send('JOIN', channels, keys);
					} else if (channels.length !== 0) {
						client.send('JOIN', channels);
					}
					break;
				case 'ME':
					if (args) client.action(data.to, args);
					break;
				case 'MODE':
					break;
				case 'MSG':
					if (args) {
						console.log(args);
						match = args.match(/^([^ ]+) (.*)/);
						if (match)
							client.say(match[1],match[2]);
					}
					break;
				case 'NICK':
					match = args.match(/^([A-Za-z\[\]\\`\^{\|}]+[A-Za-z0-9\[\]\\`\^{\|}-]*)/);
					if (match[1]) client.send('NICK', match[1]);
					break;
				case 'OP':
					break;
				case 'PART':
					chanlist = [];
					if (args)
						chanlist = args.replace(', ',',').split(',');
					else
						chanlist = [data.to];
					channels = []
					for (var i = 0; i < chanlist.length; i++) {
						if (client.opt.channels.indexOf(chanlist[i]) != -1)
							channels.push(chanlist[i]);
					}
					if (channels.length !== 0)
						client.send('PART', channels);
					break;
				case 'QUIT':
					console.log(args);
					client.disconnect(args);
					break;
				case 'VOICE':
					break;
			}
		}
	});
	
	client.on("selfMessage", function(to, text) {
		action = false;
		if (match = text.match(/^\u0001ACTION (.*)\u0001/)) {
			text = match[1];
			action = true;
		}
		socket.emit('message', {"from": client.nick, "to": to, "action": action, "msg": text})
	});
	
	socket.on('disconnect', function (data) {
		client.disconnect('Leaving');
	});
});
