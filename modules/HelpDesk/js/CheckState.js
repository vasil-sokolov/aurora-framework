'use strict';

var
	_ = require('underscore'),
	
	Ajax = require('modules/HelpDesk/js/Ajax.js'),
	UserSettings = require('core/js/Settings.js'),
	
	Settings = require('modules/HelpDesk/js/Settings.js'),
	HeaderItemView = require('modules/HelpDesk/js/views/HeaderItemView.js'),
	
	bAgent = false,
	iTimer = 0
;

function RequestThreads()
{
	Ajax.send('GetThreads', {
		'Offset': 0,
		'Limit': Settings.ThreadsPerPage,
		'Filter': bAgent ? Enums.HelpdeskFilters.Open : Enums.HelpdeskFilters.All,
		'Search': ''
	}, function (oResponse) {
		var
			aThreads = (oResponse.Result && _.isArray(oResponse.Result.List)) ? oResponse.Result.List : [],
			iUnseen = _.filter(aThreads, function (oThread) {
				return !oThread.IsRead;
			}, this).length
		;
		
		HeaderItemView.unseenCount(iUnseen);
		iTimer = setTimeout(RequestThreads, UserSettings.AutoRefreshIntervalMinutes * 60 * 1000)
	});
}

module.exports = {
	start: function () {
		RequestThreads();
	},
	end: function () {
		clearTimeout(iTimer);
	}
};