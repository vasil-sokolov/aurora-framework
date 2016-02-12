'use strict';

var
	$ = require('jquery'),
			
	TextUtils = require('core/js/utils/Text.js'),
	Utils = require('core/js/utils/Common.js'),
	
	Storage = require('core/js/Storage.js'),
	UserSettings = require('core/js/Settings.js'),
	
	Popups = require('core/js/Popups.js'),
	ConfirmPopup = require('core/js/popups/ConfirmPopup.js'),
	
	MailCache = require('modules/Mail/js/Cache.js'),
	
	MailUtils = {}
;

/**
 * Moves the specified messages in the current folder to the Trash or delete permanently 
 * if the current folder is Trash or Spam.
 * 
 * @param {Array} aUids
 * @param {Function=} fAfterDelete
 */
MailUtils.deleteMessages = function (aUids, fAfterDelete)
{
	if (!$.isFunction(fAfterDelete))
	{
		fAfterDelete = function () {};
	}
	
	var
		oFolderList = MailCache.folderList(),
		sCurrFolder = oFolderList.currentFolderFullName(),
		oTrash = oFolderList.trashFolder(),
		bInTrash =(oTrash && sCurrFolder === oTrash.fullName()),
		oSpam = oFolderList.spamFolder(),
		bInSpam = (oSpam && sCurrFolder === oSpam.fullName()),
		fDeleteMessages = function (bResult) {
			if (bResult)
			{
				MailCache.deleteMessages(aUids);
				fAfterDelete();
			}
		}
	;
	
	if (bInSpam)
	{
		MailCache.deleteMessages(aUids);
		fAfterDelete();
	}
	else if (bInTrash)
	{
		Popups.showPopup(ConfirmPopup, [TextUtils.i18n('CORE/CONFIRM_ARE_YOU_SURE'), fDeleteMessages]);
	}
	else if (oTrash)
	{
		MailCache.moveMessagesToFolder(oTrash.fullName(), aUids);
		fAfterDelete();
	}
	else if (!oTrash)
	{
		Popups.showPopup(ConfirmPopup, [TextUtils.i18n('MAIL/CONFIRM_MESSAGES_DELETE_NO_TRASH_FOLDER'), fDeleteMessages]);
	}
};

MailUtils.registerMailto = function (bRegisterOnce)
{
	if (window.navigator && $.isFunction(window.navigator.registerProtocolHandler) && (!bRegisterOnce || Storage.getData('MailtoAsked') !== 1))
	{
		window.navigator.registerProtocolHandler(
			'mailto',
			Utils.getAppPath() + '#compose/to/%s',
			UserSettings.SiteName !== '' ? UserSettings.SiteName : 'WebMail'
		);

		Storage.setData('MailtoAsked', 1);
	}
};

module.exports = MailUtils;
