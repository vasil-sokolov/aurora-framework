'use strict';

var
	ko = require('knockout'),
	_ = require('underscore'),
	$ = require('jquery'),
	
	Utils = require('core/js/utils/Common.js'),
	TextUtils = require('core/js/utils/Text.js'),
	AddressUtils = require('core/js/utils/Address.js'),
	Api = require('core/js/Api.js'),
	Routing = require('core/js/Routing.js'),
	Screens = require('core/js/Screens.js'),
	App = require('core/js/App.js'),
	Ajax = require('core/js/Ajax.js'),
	Storage = require('core/js/Storage.js'),
	UserSettings = require('core/js/Settings.js'),
	WindowOpener = require('core/js/WindowOpener.js'),
	CJua = require('core/js/CJua.js'),
	CSelector = require('core/js/CSelector.js'),
	CPageSwitcherView = require('core/js/views/CPageSwitcherView.js'),
	CAbstractView = require('core/js/views/CAbstractView.js'),
	
	Popups = require('core/js/Popups.js'),
	AlertPopup = require('core/js/popups/AlertPopup.js'),
	
	Settings = require('modules/Helpdesk/js/Settings.js'),
	HeaderItemView = require('modules/Helpdesk/js/views/HeaderItemView.js'),
	CThreadListModel = require('modules/Helpdesk/js/models/CThreadListModel.js'),
	CPostModel = require('modules/Helpdesk/js/models/CPostModel.js'),
	CHelpdeskAttachmentModel = require('modules/Helpdesk/js/models/CHelpdeskAttachmentModel.js'),
	
	bExtApp = false,
	bMobileDevice = false,
	bSingleMode = false
;

/**
 * @constructor
 */
function CHelpdeskView()
{
	CAbstractView.call(this);
	
	var
		self = this,
		fChangeStateHelper = function(state) {
			return function () {
				self.executeChangeState(state);
				self.isQuickReplyHidden(!self.bAgent);

				if (state === Enums.HelpdeskThreadStates.Resolved)
				{
					self.selectedItem(null);
					Routing.setHash(['helpdesk', '']);
				}
			};
		}
	;

	//use different ajax functions for different application
	this.bRtl = UserSettings.IsRTL;

	this.iAutoCheckTimer = 0;

	this.bExtApp = bExtApp;
	this.ajaxSendFunc = this.bExtApp ? 'sendExt' : 'send';
	this.bAgent = Settings.IsHelpdeskAgent;
	this.singleMode = bSingleMode;

	this.externalUrl = ko.observable(Settings.HelpdeskIframeUrl);

	this.signature = Settings.helpdeskSignature;
	this.signatureEnable = Settings.helpdeskSignatureEnable;
	this.isSignatureVisible = ko.computed(function () {
		return this.signature() !== '' && this.signatureEnable() === '1';
	}, this);

	this.loadingList = ko.observable(true);
	this.loadingViewPane = ko.observable(false);
	this.loadingMoreMessages = ko.observable(false);

	this.threads = ko.observableArray([]);
	this.posts = ko.observableArray([]);

	this.iPingInterval = -1;
	this.iPingStartTimer = -1;
	this.selectedItem = ko.observable(null);
	this.previousSelectedItem = ko.observable(null);
	this.postForDelete = ko.observable(null);
	this.state = ko.observable(0);
	this.selectedItem.subscribe(function (oItem) {
		this.state(oItem ? oItem.state() : 0);
		this.subject(this.selectedItem() ? (this.bExtApp ? this.selectedItem().sSubject : this.selectedItem().sFromFull) : '');
		this.internalNote(false);

//		if (!this.bExtApp && this.selectedItem())
//		{
//			ContactsCache.getContactsByEmails([this.selectedItem().sEmail], this.onOwnerContactResponse, this);
//		}

		clearInterval(this.iPingInterval);
		clearTimeout(this.iPingStartTimer);
		this.watchers([]);
		if (this.selectedItem())
		{
			this.iPingStartTimer = setTimeout(_.bind(function () {
				this.executeThreadPing(this.selectedItem().Id);

				clearInterval(this.iPingInterval);
				this.iPingInterval = setInterval(_.bind(function () {
					this.executeThreadPing(this.selectedItem().Id);
				}, this), 180000);
			}, this), 5000);
		}
	}, this);

	this.listFilter = ko.observable(this.bAgent ? Enums.HelpdeskFilters.Open : Enums.HelpdeskFilters.All);
	this.listFilter.subscribe(function () {
		this.requestThreadsList();
	}, this);
	this.prevListFilter = ko.observable('');

	this.hasMorePosts = ko.computed(function () {
		var oItem = this.selectedItem();
		return oItem && oItem.postsCount() > this.posts().length;
	}, this).extend({ throttle: 1 });

	//list selector
	this.selector = new CSelector(
		this.threads,
		_.bind(this.onItemSelect, this),
		_.bind(this.onItemDelete, this),
		null, null, null, false, false, false, true
	);

	this.checkStarted = ko.observable(false);

	this.checkAll = this.selector.koCheckAll();
	this.checkAllIncomplite = this.selector.koCheckAllIncomplete();

	this.oPageSwitcher = new CPageSwitcherView(0, Settings.ThreadsPerPage);

	this.oPageSwitcher.currentPage.subscribe(function () {
		this.requestThreadsList();
	}, this);

	//search
	this.isSearchFocused = ko.observable(false);
	this.search = ko.observable('');

	this.searchText = ko.computed(function () {
		return TextUtils.i18n('HELPDESK/INFO_SEARCH_RESULT', {
			'SEARCH': this.search()
		});
	}, this);

	//commands
	this.deleteCommand = Utils.createCommand(this, this.executeDelete, this.isEnableListActions);

	this.openNewWindowCommand = Utils.createCommand(this, this.executeOpenNewWindow, this.isEnableListActions);

	this.checkCommand = Utils.createCommand(this, function () {
		this.requestThreadsList();
		this.requestPosts();
		this.startAutocheckmail();
	});

	this.closeCommand = Utils.createCommand(this, fChangeStateHelper(Enums.HelpdeskThreadStates.Resolved), this.isEnableListActions);
	this.waitCommand = Utils.createCommand(this, fChangeStateHelper(Enums.HelpdeskThreadStates.Waiting), this.isEnableListActions);
	this.pendingCommand = Utils.createCommand(this, fChangeStateHelper(Enums.HelpdeskThreadStates.Pending), this.isEnableListActions);
	this.deferCommand = Utils.createCommand(this, fChangeStateHelper(Enums.HelpdeskThreadStates.Deferred), this.isEnableListActions);
	this.answerCommand = Utils.createCommand(this, fChangeStateHelper(Enums.HelpdeskThreadStates.Answered), this.isEnableListActions);

	this.postCommand = Utils.createCommand(this, this.executePostCreate, function () {
		return !!this.selectedItem() &&
			!this.isQuickReplyPaneEmpty() &&
			this.allAttachmentsUploaded();
	});

	this.visibleNewThread = ko.observable(false);
	this.newThreadId = ko.observable(0);
	this.newThreadText = ko.observable('');
	this.newThreadCreating = ko.observable(false);
	this.domNewThreadTextarea = ko.observable(null);
	this.newThreadTextFocus = ko.observable(null);
	this.createThreadCommand = Utils.createCommand(this, this.executeThreadCreate, function () {
		return this.visibleNewThread() && this.newThreadText().length > 0 && !this.newThreadCreating();
	});
	this.createThreadButtonText = ko.computed(function () {
		return this.newThreadCreating() ?
			TextUtils.i18n('MAIN/BUTTON_SENDING') :
			TextUtils.i18n('HELPDESK/BUTTON_CREATE');
	}, this);

	this.commandGetOlderPosts = function () {
		var
			aList = this.posts(),
			iPostId  = aList[0] ? aList[0].Id : 0
		;

		this.requestPosts(null, iPostId);
	};

	this.externalContentUrl = ko.observable('');

	if (Settings.HelpdeskIframeUrl)
	{
		if (this.bAgent)
		{
			this.externalContentUrl = ko.computed(function () {

				var
					sEmail = '',
					oSelected = this.selectedItem()
				;

				if (oSelected)
				{
					sEmail = oSelected.Email();
				}

				if (sEmail)
				{
					return Settings.HelpdeskIframeUrl.replace(/\[EMAIL\]/g, sEmail);
				}

				return '';

			}, this);
		}
//		else if (AppData.User.Email)
//		{
//			this.externalContentUrl = ko.computed(function () {
//				return Settings.HelpdeskIframeUrl.replace(/\[EMAIL\]/g, AppData.User.Email);
//			}, this);
//		}
	}

	// view pane
	this.clientDetailsVisible = ko.observable(
		Storage.hasData('HelpdeskUserDetails') ? Storage.getData('HelpdeskUserDetails') : true);

	this.clientDetailsVisible.subscribe(function (value) {
		Storage.setData('HelpdeskUserDetails', value);
	}, this);

	this.subject = ko.observable('');
	this.watchers = ko.observableArray([]);
	this.ownerExistsInContacts = ko.observable(false);
	this.ownerContactInfoReceived = ko.observable(false);
	this.ownerContact = ko.observable(/*!this.bExtApp ? new CContactModel() :*/ null);
	this.hasOwnerContact = ko.computed(function () {
		return !this.singleMode && this.ownerContactInfoReceived() && this.ownerExistsInContacts();
	}, this);
	this.visibleAddToContacts = ko.computed(function () {
		return !this.singleMode && this.ownerContactInfoReceived() && !this.ownerExistsInContacts();
	}, this);

	this.contactCardWidth = ko.observable(0);

	this.uploadedFiles = ko.observableArray([]);
	this.allAttachmentsUploaded = ko.computed(function () {
		var
			aNotUploadedFiles = _.filter(this.uploadedFiles(), function (oFile) {
				return !oFile.uploaded();
			})
		;

		return aNotUploadedFiles.length === 0;
	}, this);
	this.uploaderButton = ko.observable(null);
	this.uploaderButtonCompose = ko.observable(null);
	this.uploaderArea = ko.observable(null);
	this.bDragActive = ko.observable(false);//.extend({'throttle': 1});

	this.internalNote = ko.observable(false);

	this.ccbccVisible = ko.observable(false);
	/*this.ccbccVisible.subscribe(function () {
		_.defer(_.bind(function () {
			$(this.ccAddrDom()).inputosaurus('resizeInput');
			$(this.bccAddrDom()).inputosaurus('resizeInput');
		}, this));
	}, this);*/
	this.ccAddrDom = ko.observable();
	this.ccAddrDom.subscribe(function () {
		this.initInputosaurus(this.ccAddrDom, this.ccAddr, this.lockCcAddr, 'cc');
	}, this);
	this.lockCcAddr = ko.observable(false);
	this.ccAddr = ko.observable('').extend({'reversible': true});
	this.ccAddr.subscribe(function () {
		if (!this.lockCcAddr())
		{
			$(this.ccAddrDom()).val(this.ccAddr());
			$(this.ccAddrDom()).inputosaurus('refresh');
		}
	}, this);
	this.bccAddrDom = ko.observable();
	this.bccAddrDom.subscribe(function () {
		this.initInputosaurus(this.bccAddrDom, this.bccAddr, this.lockBccAddr, 'bcc');
	}, this);
	this.lockBccAddr = ko.observable(false);
	this.bccAddr = ko.observable('').extend({'reversible': true});
	this.bccAddr.subscribe(function () {
		if (!this.lockBccAddr())
		{
			$(this.bccAddrDom()).val(this.bccAddr());
			$(this.bccAddrDom()).inputosaurus('refresh');
		}
	}, this);

	this.preventFalseClick = ko.observable(false).extend({'autoResetToFalse': 500});

	this.isQuickReplyHidden = ko.observable(!this.bAgent);
	this.domQuickReply = ko.observable(null);
	this.domQuickReplyTextarea = ko.observable(null);
	this.replySendingStarted = ko.observable(false);
	this.replyPaneVisible = ko.observable(true);
	this.replyText = ko.observable('');
	this.replyTextFocus = ko.observable(false);
	this.isQuickReplyActive = ko.observable(false);
	this.replyTextFocus.subscribe(function (bFocus) {
		if (bFocus)
		{
			this.isQuickReplyActive(true);
			this.setSignature(this.replyText, this.domQuickReplyTextarea());
		}
	}, this);
	this.isQuickReplyActive.subscribe(function () {
		if (this.isQuickReplyActive())
		{
			this.replyTextFocus(true);
		}
	}, this);
	this.isQuickReplyPaneEmpty = ko.computed(function () {
		return ($.trim(this.replyText()) === this.signature() || this.replyText() === '');
	}, this);

	this.isNewThreadPaneEmpty = ko.computed(function () {
		return ($.trim(this.newThreadText()) === this.signature() || this.newThreadText() === '');
	}, this);

	// view pane //

	this.isSearch = ko.computed(function () {
		return '' !== this.search();
	}, this);

	this.isEmptyList = ko.computed(function () {
		return 0 === this.threads().length;
	}, this);

	if (this.bAgent)
	{
		this.dynamicEmptyListInfo = ko.computed(function () {
			return this.isEmptyList() && this.isSearch() ?
				TextUtils.i18n('HELPDESK/INFO_SEARCH_EMPTY') : TextUtils.i18n('HELPDESK/INFO_EMPTY_OPEN_THREAD_LIST_AGENT');
		}, this);
	}
	else
	{
		this.dynamicEmptyListInfo = ko.computed(function () {
			return this.isEmptyList() && this.isSearch() ?
				TextUtils.i18n('HELPDESK/INFO_SEARCH_EMPTY') : TextUtils.i18n('HELPDESK/INFO_EMPTY_THREAD_LIST');
		}, this);
	}

	this.simplePreviewPane = ko.computed(function () { //TODO on first load oItem is null therefore loaded the wrong template - Helpdesk_ViewThread
		var oItem = this.selectedItem();
		return oItem ? oItem.ItsMe : !this.bAgent;
	}, this);

	this.allowInternalNote = ko.computed(function () {
		return !this.simplePreviewPane();
	}, this);

	this.scrollToTopTrigger = ko.observable(false);
	this.scrollToBottomTrigger = ko.observable(false);

	this.allowDownloadAttachmentsLink = false;

	this.newThreadButtonWidth = ko.observable(0);

	this.focusedField = ko.observable();

	this.requestFromLogin();
}

_.extendOwn(CHelpdeskView.prototype, CAbstractView.prototype);

CHelpdeskView.prototype.ViewTemplate = 'Helpdesk_HelpdeskView';

/**
 * @param {Object} koAddrDom
 * @param {Object} koAddr
 * @param {Object} koLockAddr
 * @param {String} sFocusedField
 */
CHelpdeskView.prototype.initInputosaurus = function (koAddrDom, koAddr, koLockAddr, sFocusedField)
{
	if (koAddrDom() && $(koAddrDom()).length > 0)
	{
		$(koAddrDom()).inputosaurus({
			width: 'auto',
			parseOnBlur: true,
			autoCompleteSource: _.bind(function (oData, fResponse) {
				this.autocompleteCallback(oData.term, fResponse);
			}, this),
			autoCompleteAppendTo : $(koAddrDom()).closest('td'),
			change : _.bind(function (ev) {
				koLockAddr(true);
				this.setRecipient(koAddr, ev.target.value);
				koLockAddr(false);
			}, this),
			copy: _.bind(function (sVal) {
				this.inputosaurusBuffer = sVal;
			}, this),
			paste: _.bind(function () {
				var sInputosaurusBuffer = this.inputosaurusBuffer || '';
				this.inputosaurusBuffer = '';
				return sInputosaurusBuffer;
			}, this),
			focus: _.bind(this.focusedField, this, sFocusedField),
			mobileDevice: bMobileDevice
		});
	}
};

/**
 * @param {string} sTerm
 * @param {Function} fResponse
 */
CHelpdeskView.prototype.autocompleteCallback = function (sTerm, fResponse)
{
	var
		oParameters = {
			'Action': 'ContactSuggestions',
			'Search': sTerm
		}
		;

	Ajax.send(oParameters, function (oResponse) {

		var aList = [];
		if (oResponse && oResponse.Result && oResponse.Result && oResponse.Result.List)
		{
			aList = _.map(oResponse.Result.List, function (oItem) {

				var
					sLabel = '',
					sValue = oItem.Email
					;

				if (oItem.IsGroup)
				{
					if (oItem.Name && 0 < $.trim(oItem.Name).length)
					{
						sLabel = '"' + oItem.Name + '" (' + oItem.Email + ')';
					}
					else
					{
						sLabel = '(' + oItem.Email + ')';
					}
				}
				else
				{
					sLabel = AddressUtils.getFullEmail(oItem.Name, oItem.Email);
					sValue = sLabel;
				}

				return {'label': sLabel, 'value': sValue, 'frequency': oItem.Frequency};
			});

			aList = _.compact(aList);
		}

		fResponse(aList);

	}, this);
};

/**
 * @param {Object} koRecipient
 * @param {string} sRecipient
 */
CHelpdeskView.prototype.setRecipient = function (koRecipient, sRecipient)
{
	if (koRecipient() === sRecipient)
	{
		koRecipient.valueHasMutated();
	}
	else
	{
		koRecipient(sRecipient);
	}
};

CHelpdeskView.prototype.requestFromLogin = function ()
{
	if (this.bExtApp && Storage.getData('helpdeskQuestion'))
	{
		this.newThreadText(Storage.getData('helpdeskQuestion'));
		Storage.removeData('helpdeskQuestion');
		this.executeThreadCreate();
	}
};

CHelpdeskView.prototype.cleanAll = function ()
{
	this.replyText('');
	this.replyTextFocus(false);
	this.newThreadText('');
	this.uploadedFiles([]);
	this.posts([]);
	this.internalNote(false);
	this.isQuickReplyActive(false);
	this.ccbccVisible(false);
	this.ccAddr('');
	this.bccAddr('');
	//this.setRecipient(this.ccAddr, '');
	//this.setRecipient(this.bccAddr, '');
};

/**
 * @param {Object} oContact
 */
CHelpdeskView.prototype.onOwnerContactResponse = function (oContact)
{
//	if (oContact)
//	{
//		this.ownerContact(oContact);
//		this.ownerExistsInContacts(true);
//	}
//	else
//	{
//		this.ownerContact(new CContactModel());
//		this.ownerExistsInContacts(false);
//	}
//
//	this.ownerContactInfoReceived(true);
};

CHelpdeskView.prototype.updateOpenerWindow = function ()
{
//	if (this.singleMode && window.opener && window.opener.App)
//	{
//		window.opener.App.updateHelpdesk();
//	}
};

/**
 * @param {Object} oPost
 */
CHelpdeskView.prototype.deletePost = function (oPost)
{
	if (oPost && oPost.itsMe())
	{
		Screens.showPopup(ConfirmPopup, [TextUtils.i18n('HELPDESK/CONFIRM_DELETE_THIS_POST'),
			_.bind(function (bResult) {
				if (bResult)
				{
					this.postForDelete(oPost);
					Ajax[this.ajaxSendFunc]({
						'Action': 'HelpdeskPostDelete',
						'PostId': oPost.Id,
						'ThreadId': oPost.IdThread,
						'IsExt': this.bExtApp ? 1 : 0
					}, this.onHelpdeskPostDeleteResponse, this);
				}
			}, this)
		]);
	}
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onHelpdeskPostDeleteResponse = function (oResponse, oRequest)
{
	if (oResponse.Result === false)
	{
		Api.showErrorByCode(oResponse, TextUtils.i18n('HELPDESK/ERROR_COULDNT_DELETE_POST'));
	}
	else
	{
		this.posts.remove(this.postForDelete());
		Screens.showReport(TextUtils.i18n('HELPDESK/REPORT_POST_HAS_BEEN_DELETED'));
	}

	this.requestPosts();
	this.updateOpenerWindow();
};

CHelpdeskView.prototype.addToContacts = function ()
{
//	if (this.selectedItem())
//	{
//		ContactsCache.addToContacts('', this.selectedItem().sEmail, this.onAddToContactsResponse, this);
//	}
};

CHelpdeskView.prototype.iHaveMoreToSay = function ()
{
	this.isQuickReplyHidden(false);
	_.delay(_.bind(function () {
		this.replyTextFocus(true);
	}, this), 300);
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onAddToContactsResponse = function (oResponse, oRequest)
{
//	if (oResponse.Result && this.selectedItem() && oRequest.HomeEmail !== '' && oRequest.HomeEmail === this.selectedItem().sEmail)
//	{
//		Screens.showReport(TextUtils.i18n('CONTACTS/REPORT_CONTACT_SUCCESSFULLY_ADDED'));
//		ContactsCache.clearInfoAboutEmail(this.selectedItem().sEmail);
//		ContactsCache.getContactsByEmails([this.selectedItem().sEmail], this.onOwnerContactResponse, this);
//	}
};

CHelpdeskView.prototype.scrollPostsToBottom = function ()
{
	this.scrollToBottomTrigger(!this.scrollToBottomTrigger());
};

CHelpdeskView.prototype.scrollPostsToTop = function ()
{
	this.scrollToTopTrigger(!this.scrollToTopTrigger());
};

CHelpdeskView.prototype.showClientDetails = function ()
{
	this.clientDetailsVisible(true);
};

CHelpdeskView.prototype.hideClientDetails = function ()
{
	this.clientDetailsVisible(false);
};

CHelpdeskView.prototype.startAutocheckmail = function ()
{
	var self = this, iIntervalInMin = UserSettings.AutoRefreshIntervalMinutes;
	if (0 < iIntervalInMin)
	{
		clearTimeout(this.iAutoCheckTimer);
		this.iAutoCheckTimer = setTimeout(function () {
			self.checkCommand();
		}, iIntervalInMin * 60 * 1000);
	}
};

/**
 * @param {Object} $viewModel
 */
CHelpdeskView.prototype.onBind = function ($viewModel)
{
	this.selector.initOnApplyBindings(
		'.items_sub_list .item',
		'.items_sub_list .selected.item',
		'.items_sub_list .item .custom_checkbox',
		$('.items_list', $viewModel),
		$('.threads_scroll.scroll-inner', $viewModel)
	);

	this.initUploader();

	$(this.domQuickReply()).on('click', _.bind(function (oEvent) {
		this.preventFalseClick(true);
	}, this));

	$(document.body).on('click', _.bind(function (oEvent) {
		if (Screens.currentScreen() === 'helpdesk' && this.isQuickReplyPaneEmpty() && !this.preventFalseClick())
		{
			this.replyText('');
			this.isQuickReplyActive(false);
		}
	}, this));

//	if (App.registerHelpdeskUpdateFunction)
//	{
//		App.registerHelpdeskUpdateFunction(_.bind(this.checkCommand, this));
//	}

	this.startAutocheckmail();
};

CHelpdeskView.prototype.onShow = function ()
{
	this.newThreadButtonWidth.notifySubscribers();
	this.selector.useKeyboardKeys(true);

	this.oPageSwitcher.show();
	this.oPageSwitcher.perPage(this.ThreadsPerPage);
	this.oPageSwitcher.currentPage(1);

	this.requestThreadsList();
};

CHelpdeskView.prototype.onHide = function ()
{
	this.selector.useKeyboardKeys(false);
	this.oPageSwitcher.hide();
};

CHelpdeskView.prototype.requestThreadsList = function ()
{
	if (!this.newThreadCreating()) {
		this.loadingList(true);
		this.checkStarted(true);

		Ajax[this.ajaxSendFunc]({
			'Action': 'HelpdeskThreadsList',
			'IsExt': this.bExtApp ? 1 : 0,
			'Offset': (this.oPageSwitcher.currentPage() - 1) * this.ThreadsPerPage,
			'Limit': this.ThreadsPerPage,
			'Filter': this.listFilter(),
			'Search': this.search()
		}, this.onHelpdeskThreadsListResponse, this);

		this.requestThreadsPendingCount();
	}
};

CHelpdeskView.prototype.requestThreadByIdOrHash = function (iThreadId, sThreadHash)
{
	Ajax[this.ajaxSendFunc]({
		'Action': 'HelpdeskThreadByIdOrHash',
		'IsExt': this.bExtApp ? 1 : 0,
		'ThreadId': iThreadId ? iThreadId : 0,
		'ThreadHash': sThreadHash ? sThreadHash : ''
	}, this.onThreadByIdOrHashResponse, this);
};

CHelpdeskView.prototype.requestThreadsPendingCount = function ()
{
	Ajax[this.ajaxSendFunc]({
		'Action': 'HelpdeskThreadsPendingCount',
		'IsExt': this.bExtApp ? 1 : 0
	}, this.onHelpdeskThreadsPendingCountResponse, this);
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onHelpdeskThreadsListResponse = function (oResponse, oRequest)
{
	var
		iIndex = 0,
		iLen = 0,
		oSelectedItem = this.selectedItem(),
		sSelectedId = oSelectedItem ? Utils.pString(oSelectedItem.Id) : '',
		aList = [],
		oObject = null,
		oThreadForSelect = null,
		aThreadList = (oResponse.Result && _.isArray(oResponse.Result.List)) ? oResponse.Result.List : []
	;

	this.checkStarted(false);

	if (oResponse.Result === false)
	{
		Api.showErrorByCode(oResponse);
	}
	else
	{
		for (iLen = aThreadList.length; iIndex < iLen; iIndex++)
		{
			if (aThreadList[iIndex] && 'Object/CHelpdeskThread' === aThreadList[iIndex]['@Object'])
			{
				oObject = new CThreadListModel();
				oObject.parse(aThreadList[iIndex]);
				oObject.OwnerIsMe = Utils.pString(oObject.IdOwner);

				if (sSelectedId === Utils.pString(oObject.Id))
				{
					oSelectedItem.postsCount(oObject.postsCount());

					oObject.selected(true);
					this.selector.itemSelected(oObject);
				}

				aList.push(oObject);
			}
		}

		this.loadingList(false);

		if (this.newThreadId()) {
			var iThreadId = this.newThreadId();

			this.onItemSelect( _.find(this.threads().concat(aList), function(oItem){ return oItem.ItsMe && oItem.Id === iThreadId; }));
			this.newThreadId(null);
		}

		this.threads(aList);
		this.setUnseenCount();

		this.oPageSwitcher.setCount(Utils.pInt(oResponse.Result.ItemsCount));

		if (Settings.HelpdeskThreadId)
		{
			oThreadForSelect = _.find(aList, function (oThreadItem) {
				return oThreadItem.Id === Settings.HelpdeskThreadId;
			}, this);

			if (oThreadForSelect)
			{
				this.onItemSelect(oThreadForSelect);
			}
			else if (aList.length)
			{
				this.requestThreadByIdOrHash(Settings.HelpdeskThreadId);
			}
		}

		if (Settings.HelpdeskThreadAction)
		{
			if (Settings.HelpdeskThreadAction === 'add')
			{
				this.iHaveMoreToSay();
			}
			else if (Settings.HelpdeskThreadAction === 'close')
			{
				this.closeCommand();
			}
		}
	}
};

CHelpdeskView.prototype.onHelpdeskThreadsPendingCountResponse = function (oResponse, oRequest)
{
	if (oResponse.Result === false)
	{
		Api.showErrorByCode(oResponse);
	}
	else
	{
//		App.helpdeskPendingCount(oResponse.Result);
	}
};

/**
 * @param {Object=} oItem = undefined
 * @param {number=} iStartFromId = 0
 */
CHelpdeskView.prototype.requestPosts = function (oItem, iStartFromId)
{
	var
		oSelectedThread = this.selectedItem(),
		iId = oItem ? oItem.Id : (oSelectedThread ? oSelectedThread.Id : 0),
		iFromId = iStartFromId ? iStartFromId : 0,
		oParameters = {}
	;

	if (iId)
	{
		oParameters = {
			'Action': 'HelpdeskThreadPosts',
			'IsExt': this.bExtApp ? 1 : 0,
			'ThreadId': iId,
			'StartFromId': iFromId,
			'Limit': 5
		};

		if (iFromId)
		{
			this.loadingMoreMessages(true);
		}

		Ajax[this.ajaxSendFunc](oParameters, this.onHelpdeskThreadPostsResponse, this);
	}
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onHelpdeskThreadPostsResponse = function (oResponse, oRequest)
{
	var
		self = this,
		iIndex = 0,
		iLen = 0,
		aList = [],
		aPosts = [],
		oObject = null,
		aPostList = (oResponse.Result && _.isArray(oResponse.Result.List)) ? oResponse.Result.List : []
	;

	if (oResponse.Result === false)
	{
		Api.showErrorByCode(oResponse);
	}
	else
	{
		if (this.selectedItem() && oResponse.Result.ThreadId === this.selectedItem().Id)
		{
			this.selectedItem().postsCount(Utils.pInt(oResponse.Result.ItemsCount));

			for (iLen = aPostList.length; iIndex < iLen; iIndex++)
			{
				if (aPostList[iIndex] && 'Object/CHelpdeskPost' === aPostList[iIndex]['@Object'])
				{
					oObject = new CPostModel();
					oObject.parse(aPostList[iIndex]);

					aList.push(oObject);
				}
			}

			aPosts = this.posts();

			if (oResponse.Result.StartFromId)
			{
				_.each(aList, function (oItem, iIdx) {
					this.posts.unshift(oItem);
				}, this);

				this.loadingMoreMessages(false);
			}
			else
			{
				if (aPosts.length === 0 || aPosts[aPosts.length - 1].Id !== aList[0].Id) //check match last items
				{
					if (aPosts.length !== 0)
					{
						_.each(aList.reverse(), function (oItem, iIdx) {
							if (!_.find(aPosts, function(oPost){ return oPost.Id === oItem.Id; })) //remove duplicated posts from aList
							{
								this.posts.push(oItem); //push unique/new items to list
							}
						}, this);
					}
					else
					{
						this.posts(aList.reverse()); //first/initial occurrence
					}

					_.delay(function () {
						self.scrollPostsToBottom();
					}, 100);
				}
			}

			if (this.selectedItem().unseen())
			{
				this.executeThreadSeen(this.selectedItem().Id);
			}
		}
	}
};

/**
 * @param {Array} aParams
 */
CHelpdeskView.prototype.onRoute = function (aParams)
{
	var
		sThreadHash = aParams[0],
		oItem = _.find(this.threads(), function (oThread) {
			return oThread.ThreadHash === sThreadHash;
		})
	;

	if (oItem)
	{
		oItem = /** @type {Object} */ oItem;
		this.onItemSelect(oItem);
	}
	else if (this.threads().length === 0 && this.loadingList() && this.threadSubscription === undefined && !bSingleMode)
	{
		this.threadSubscription = this.threads.subscribe(function () {
			this.onRoute(aParams);
			this.threadSubscription.dispose();
			this.threadSubscription = undefined;
		}, this);
	}
	else if (sThreadHash)
	{
		this.requestThreadByIdOrHash(null, sThreadHash);
	}
	else
	{
		this.selectedItem(null);
		this.selector.itemSelected(null);
	}
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onThreadByIdOrHashResponse = function (oResponse, oRequest)
{
	var oItem = new CThreadListModel();

	if (oResponse.Result)
	{
		oItem.parse(oResponse.Result);
		oItem.OwnerIsMe = Utils.pString(oItem.IdOwner);
		this.onItemSelect(oItem);
	}
};

/**
 * @param {Object} oItem
 */
CHelpdeskView.prototype.onItemSelect = function (oItem)
{
    this.previousSelectedItem(this.selectedItem());
	if (!this.selectedItem() || oItem && (this.selectedItem().ThreadHash !== oItem.ThreadHash || this.selectedItem().Id !== oItem.Id))
	{
		if (!this.replySendingStarted() && (!this.isQuickReplyPaneEmpty() || !this.isNewThreadPaneEmpty()))
		{
			Screens.showPopup(ConfirmPopup, [TextUtils.i18n('HELPDESK/CONFIRM_CANCEL_REPLY'),
					_.bind(function (bResult) {
					if (bResult)
					{
						this.selectItem(oItem);
					}
					else
					{
						this.replyTextFocus(true);
						this.isQuickReplyHidden(false);
						this.selector.itemSelected(this.previousSelectedItem());
					}
				}, this)]
			);
		}
		else
		{
			this.selectItem(oItem);
		}
	}
};

CHelpdeskView.prototype.onItemDelete = function ()
{
	this.executeDelete();
};

CHelpdeskView.prototype.selectItem = function (oItem)
{
	this.visibleNewThread(false);
	this.selector.listCheckedAndSelected(false);
	this.cleanAll();

	if (oItem) {
		this.selector.itemSelected(oItem);
		this.selectedItem(oItem);

		this.isQuickReplyHidden(oItem.ItsMe || !this.bAgent);
		this.requestPosts(oItem);

		if (!this.singleMode) {
			Routing.setHash(['helpdesk', oItem.ThreadHash]); //TODO this code causes a bug with switching to helpdesk when you on another screen
		}
		oItem.postsCount(0);
		this.posts([]);
	}
};

CHelpdeskView.prototype.openNewThread = function ()
{
	this.selector.itemSelected(null);
	this.selectedItem(null);
	this.visibleNewThread(true);
	Routing.setHash(['helpdesk', '']);
	this.newThreadTextFocus(true);
	this.setSignature(this.newThreadText, this.domNewThreadTextarea());
};

CHelpdeskView.prototype.cancelNewThread = function ()
{
	this.onItemSelect(this.previousSelectedItem());
};

CHelpdeskView.prototype.isEnableListActions = function ()
{
	return !!this.selectedItem();
};

CHelpdeskView.prototype.executeDelete = function ()
{
	var
		self = this,
		oSelectedItem = this.selectedItem()
	;

	if (oSelectedItem)
	{
		_.each(this.threads(), function (oItem) {
			if (oItem === oSelectedItem)
			{
				oItem.deleted(true);
			}
		});

		_.delay(function () {
			self.threads.remove(function (oItem) {
				return oItem.deleted();
			});
		}, 500);

		this.selectedItem(null);

		Ajax[this.ajaxSendFunc]({
			'Action': 'HelpdeskThreadDelete',
			'IsExt': this.bExtApp ? 1 : 0,
			'ThreadId': oSelectedItem.Id
		}, this.onHelpdeskThreadDeleteResponse, this);
		
		Routing.setHash(['helpdesk', '']);
	}
};

CHelpdeskView.prototype.executeOpenNewWindow = function ()
{
	var sUrl = Routing.buildHashFromArray(['helpdesk', this.selectedItem().ThreadHash]);

	WindowOpener.openTab(sUrl);
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onHelpdeskThreadDeleteResponse = function (oResponse, oRequest)
{
	this.requestThreadsList();
	this.updateOpenerWindow();
};

/**
 * @param {number} iState
 */
CHelpdeskView.prototype.executeChangeState = function (iState)
{
	var oSelectedItem = this.selectedItem();

	if (iState === undefined)
	{
		return;
	}

	//TODO can't delete thread with id = 0
	if (oSelectedItem)
	{
		oSelectedItem.state(iState);

		Ajax[this.ajaxSendFunc]({
			'Action': 'HelpdeskThreadChangeState',
			'IsExt': this.bExtApp ? 1 : 0,
			'ThreadId': oSelectedItem.Id,
			'Type': oSelectedItem.state()
		}, this.onHelpdeskThreadChangeStateResponse, this);
	}
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onHelpdeskThreadChangeStateResponse = function (oResponse, oRequest)
{
	this.requestThreadsList();
	this.updateOpenerWindow();
};

/**
 * @param {number} iId
 */
CHelpdeskView.prototype.executeThreadPing = function (iId)
{
	if (iId !== undefined)
	{
		Ajax[this.ajaxSendFunc]({
			'Action': 'HelpdeskThreadPing',
			'IsExt': this.bExtApp ? 1 : 0,
			'ThreadId': iId
		}, this.onThreadPingResponse, this);
	}
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onThreadPingResponse = function (oResponse, oRequest)
{
	this.watchers(
		_.map(oResponse.Result, function (aWatcher) {
			var
				sName = (aWatcher.length > 0) ? aWatcher[0].replace(/"/g, "") : '',
				sEmail = (aWatcher.length > 0) ? aWatcher[1] : '',
				oRes = {
					name: sName,
					email: sEmail,
					text: sEmail,
					initial: sEmail.substr(0,2),
					icon: ''
				}
			;

			if (sEmail.length > 0 && sName.length > 0)
			{
				oRes.text = '"' + sName + '" <' + sEmail + '>';
				if (/\s/g.test(sName)) //check for whitespace
				{
					oRes.initial = this.getInitials(sName);
				}
				else
				{
					oRes.initial = sName.substr(0,2);
				}
			}
			else if (sEmail.length > 0)
			{
				oRes.text = sEmail;
				oRes.initial = sEmail.substr(0,2);
			}
			else if (sName.length > 0)
			{
				oRes.text = sName;
				oRes.initial = this.getInitials(sName);
			}

			return oRes;
		}, this)
	);
};

CHelpdeskView.prototype.getInitials = function (sName)
{
	return _.reduce(sName.split(' ', 2), function(sMemo, sNamePath){ return sMemo + sNamePath.substr(0,1); }, ''); //get first letter from each of the two words
};

/**
 * @param {number} iId
 */
CHelpdeskView.prototype.executeThreadSeen = function (iId)
{
	if (iId !== undefined)
	{
		Ajax[this.ajaxSendFunc]({
			'Action': 'HelpdeskThreadSeen',
			'IsExt': this.bExtApp ? 1 : 0,
			'ThreadId': iId
		}, this.onHelpdeskThreadSeenResponse, this);
	}
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onHelpdeskThreadSeenResponse = function (oResponse, oRequest)
{
	if(oResponse.Result && this.selectedItem())
	{
		this.selectedItem().unseen(false);
		this.setUnseenCount();
	}

	this.updateOpenerWindow();
};

CHelpdeskView.prototype.executeThreadCreate = function ()
{
	var
		sNewThreadSubject = $.trim(this.newThreadText().replace(/[\n\r]/, ' ')),
		iFirstSpacePos = sNewThreadSubject.indexOf(' ', 40)
	;

	if (iFirstSpacePos >= 0)
	{
		sNewThreadSubject = sNewThreadSubject.substring(0, iFirstSpacePos);
	}

	this.newThreadCreating(true);

	this.sendHelpdeskPostCreate(0, sNewThreadSubject, this.newThreadText(), this.onThreadCreateResponse);
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onThreadCreateResponse = function (oResponse, oRequest)
{
	//TODO change created post
	this.newThreadCreating(false);

	if (oResponse.Result && oRequest)
	{
		Screens.showReport(TextUtils.i18n('HELPDESK/REPORT_THREAD_SUCCESSFULLY_CREATED'));

		if (oResponse.Result.ThreadIsNew)
		{
			this.newThreadId(oResponse.Result.ThreadId);
		}

		this.cleanAll();
		this.visibleNewThread(false);
	}

	this.requestThreadsList();
	this.updateOpenerWindow();
};

CHelpdeskView.prototype.executePostCreate = function ()
{
	if (this.selectedItem())
	{
		this.replySendingStarted(true);
		this.sendHelpdeskPostCreate(this.selectedItem().Id, '', this.replyText(), this.onPostCreateResponse);
	}
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onPostCreateResponse = function (oResponse, oRequest)
{
	this.replySendingStarted(false);

	if (oResponse.Result && oRequest)
	{
		Screens.showReport(TextUtils.i18n('HELPDESK/REPORT_POST_SUCCESSFULLY_ADDED'));
		this.cleanAll();
		this.requestPosts();
	}

	this.requestThreadsList();
	this.updateOpenerWindow();
};

/**
 * @param {number} iThreadId
 * @param {string} sSubject
 * @param {string} sText
 * @param {Function} fResponseHandler
 */
CHelpdeskView.prototype.sendHelpdeskPostCreate = function (iThreadId, sSubject, sText, fResponseHandler)
{
	var
		aAttachments = {},
		oParameters = {}
	;

	_.each(this.uploadedFiles(), function (oItem) {
		aAttachments[oItem.tempName()] = oItem.hash();
	});

	oParameters = {
		'Action': 'HelpdeskPostCreate',
		'IsExt': this.bExtApp ? 1 : 0,
		'ThreadId': iThreadId,
		'IsInternal': this.internalNote() ? 1 : 0,
		'Subject': sSubject,
		'Text': sText,
		'Cc': this.ccAddr(),
		'Bcc': this.bccAddr(),
		'Attachments': aAttachments
	};

	Ajax[this.ajaxSendFunc](oParameters, fResponseHandler, this);
};

CHelpdeskView.prototype.onShowThreadsByOwner = function ()
{
	this.search('owner:' + this.selectedItem().aOwner[0]);
	this.listFilter(Enums.HelpdeskFilters.All);
	this.requestThreadsList();
};

CHelpdeskView.prototype.onSearch = function ()
{
	this.requestThreadsList();
};

CHelpdeskView.prototype.onClearSearch = function ()
{
	this.search('');
	this.requestThreadsList();
};

/**
 * Initializes file uploader.
 */
CHelpdeskView.prototype.initUploader = function ()
{
	this.oJua = this.createJuaObject(this.uploaderButton());
	this.oJuaCompose = this.createJuaObject(this.uploaderButtonCompose());
};

/**
 * @param {Object} oButton
 */
CHelpdeskView.prototype.createJuaObject = function (oButton)
{
	if (oButton)
	{
		var oJua = new CJua({
			'action': '?/Upload/HelpdeskFile/',
			'name': 'jua-uploader',
			'queueSize': 2,
			'clickElement': oButton,
			'hiddenElementsPosition': UserSettings.IsRTL ? 'right' : 'left',
			'dragAndDropElement': oButton,
			'disableAjaxUpload': false,
			'disableFolderDragAndDrop': false,
			'disableDragAndDrop': false,
			'hidden': {
				'IsExt': this.bExtApp ? '1' : '0',
				'Token': UserSettings.CsrfToken,
				'TenantHash': this.bExtApp ? UserSettings.TenantHash : '',
				'AccountID': (this.bExtApp || !App.currentAccountId) ? 0 : App.currentAccountId()
			}
		});

		oJua
			.on('onProgress', _.bind(this.onFileUploadProgress, this))
			.on('onSelect', _.bind(this.onFileUploadSelect, this))
			.on('onStart', _.bind(this.onFileUploadStart, this))
			.on('onComplete', _.bind(this.onFileUploadComplete, this))
			.on('onBodyDragEnter', _.bind(this.bDragActive, this, true))
			.on('onBodyDragLeave', _.bind(this.bDragActive, this, false))
		;

		return oJua;
	}
	else
	{
		return null;
	}
};

/**
 * @param {string} sFileUID
 */
CHelpdeskView.prototype.onFileRemove = function (sFileUID)
{
	var oAttach = this.getUploadedFileByUID(sFileUID);

	if (this.oJua)
	{
		this.oJua.cancel(sFileUID);
	}

	this.uploadedFiles.remove(oAttach);
};

/**
 * @param {string} sFileUID
 */
CHelpdeskView.prototype.getUploadedFileByUID = function (sFileUID)
{
	return _.find(this.uploadedFiles(), function (oAttach) {
		return oAttach.uploadUid() === sFileUID;
	});
};

/**
 * @param {string} sFileUID
 * @param {Object} oFileData
 */
CHelpdeskView.prototype.onFileUploadSelect = function (sFileUID, oFileData)
{
	var
		oAttach,
		sWarningCountLimit = TextUtils.i18n('HELPDESK/ERROR_UPLOAD_FILES_COUNT'),
		sButtonCountLimit = TextUtils.i18n('MAIN/BUTTON_CLOSE'),
		iAttachCount = this.uploadedFiles().length
	;

	if (iAttachCount >= 5)
	{
		Popups.showPopup(AlertPopup, [sWarningCountLimit, null, '', sButtonCountLimit]);
		return false;
	}

	if (Api.showErrorIfAttachmentSizeLimit(oFileData.FileName, oFileData.Size))
	{
		return false;
	}

	oAttach = new CHelpdeskAttachmentModel();

	oAttach.onUploadSelect(sFileUID, oFileData);

	this.uploadedFiles.push(oAttach);

	return true;
};

/**
 * @param {string} sFileUID
 * @param {number} iUploadedSize
 * @param {number} iTotalSize
 */
CHelpdeskView.prototype.onFileUploadProgress = function (sFileUID, iUploadedSize, iTotalSize)
{
	var oAttach = this.getUploadedFileByUID(sFileUID);

	if (oAttach)
	{
		oAttach.onUploadProgress(iUploadedSize, iTotalSize);
	}
};

/**
 * @param {string} sFileUID
 */
CHelpdeskView.prototype.onFileUploadStart = function (sFileUID)
{
	var oAttach = this.getUploadedFileByUID(sFileUID);

	if (oAttach)
	{
		oAttach.onUploadStart();
	}
};

/**
 * @param {string} sFileUID
 * @param {boolean} bResult
 * @param {Object} oResult
 */
CHelpdeskView.prototype.onFileUploadComplete = function (sFileUID, bResult, oResult)
{
	var
		oAttach = this.getUploadedFileByUID(sFileUID),
		sThumbSessionUid = Date.now().toString()
		;

	if (oAttach)
	{
		oAttach.onUploadComplete(sFileUID, bResult, oResult);
		if (oAttach.type().substr(0, 5) === 'image')
		{
			oAttach.thumb(true);
			oAttach.getInThumbQueue(sThumbSessionUid);
		}
	}
};

CHelpdeskView.prototype.setUnseenCount = function ()
{
	HeaderItemView.unseenCount(_.filter(this.threads(), function (oThreadList) {
		return oThreadList.unseen();
	}, this).length);
};

CHelpdeskView.prototype.quoteText = function (sText)
{
	var sReplyText = this.replyText(),
		fDoingQuote = _.bind(function() {
			this.replyText(sReplyText === '' ? '>' + sText : sReplyText + '\n' + '>' + sText);
			this.replyTextFocus(true);
		},this);

	if(this.isQuickReplyHidden())
	{
		_.delay(function(){ fDoingQuote(); }, 300);
	}
	else
	{
		fDoingQuote();
	}
	this.isQuickReplyHidden(false);
};

CHelpdeskView.prototype.setSignature = function (koText, domTextarea)
{
	if (koText && koText() === '' && this.isSignatureVisible())
	{
		koText("\r\n\r\n" + this.signature());
	}

	if (domTextarea) {
		setTimeout(function () {
			domTextarea = domTextarea[0];
			if (domTextarea.setSelectionRange)
			{
				domTextarea.focus();
				domTextarea.setSelectionRange(0, 0);
			}
			else if (domTextarea.createTextRange)
			{
				var range = domTextarea.createTextRange();

				range.moveStart('character', 0);
				range.select();
			}
		}.bind(this), 10);
	}
};

CHelpdeskView.prototype.changeCcbccVisibility = function (koText, domTextarea)
{
	this.ccbccVisible(true);
	$(this.ccAddrDom()).inputosaurus('focus');
	//$(this.bccAddrDom()).inputosaurus('focus');
};

module.exports = CHelpdeskView;