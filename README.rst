``irc-client`` is a web application written using the NodeJS_ IRC client library, ``node-irc``_.

Set-up
-------

To configure, use the ``client`` variable near the top of ``irc-client.js``. For, example::

	var client = new irc.Client('irc.freenode.net', 'webuser', {
		userName: 'alpha',
		realName: 'web user test',
		channels: ['#nodejs-test'],
		debug: false,
		autoConnect: false
	});

``irc.freenode.net`` is the network

``webuser`` is the user's default nick

And configure ``client.html`` using the ``irc`` variable::

	var irc = {nick: 'webuser', room: '', users: []};

Set the nick you want to use here.

.. _NodeJS: http://nodejs.org/
.. _``node-irc``: https://github.com/qsheets/node-irc/