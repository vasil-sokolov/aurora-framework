'use strict';

var
	ko = require('knockout'),
	_ = require('underscore'),
	$ = require('jquery'),
	
	Utils = require('core/js/utils/Common.js'),
	TextUtils = require('core/js/utils/Text.js'),
	App = require('core/js/App.js'),
	Ajax = require('core/js/Ajax.js'),
	Screens = require('core/js/Screens.js'),
	UserSettings = require('core/js/Settings.js'),
	CJua = require('core/js/CJua.js'),
	CSelector = require('core/js/CSelector.js'),
	CAbstractView = require('core/js/views/CAbstractView.js'),
	
	Popups = require('core/js/Popups.js'),
	AlertPopup = require('core/js/popups/AlertPopup.js'),
	ConfirmPopup = require('core/js/popups/ConfirmPopup.js'),
	RenamePopup = require('modules/Files/js/popups/RenamePopup.js'),
	SharePopup = require('modules/Files/js/popups/SharePopup.js'),
	CreateFolderPopup = require('modules/Files/js/popups/CreateFolderPopup.js'),
	CreateLinkPopup = require('modules/Files/js/popups/CreateLinkPopup.js'),
	
	Settings = require('modules/Files/js/Settings.js'),
	CFileModel = require('modules/Files/js/models/CFileModel.js'),
	
	bExtApp = false
;

/**
* @constructor
* @param {boolean=} bPopup = false
*/
function CFilesView(bPopup)
{
	CAbstractView.call(this);
	
	this.allowSendEmails = ko.computed(function () {
		return false;//!!(AppData.App && AppData.App.AllowWebMail && AppData.Accounts && AppData.Accounts.isCurrentAllowsMail());
	}, this);
	
	this.error = ko.observable(false);
	this.loaded = ko.observable(false);
	this.isPublic = bExtApp;
	this.publicHash = bExtApp ? Settings.FileStoragePubHash : '';
	this.IsCollaborationSupported = Settings.IsCollaborationSupported;
	this.AllowFilesSharing = Settings.AllowFilesSharing;
	
	this.storages = ko.observableArray();
	this.folders = ko.observableArray();
	this.files = ko.observableArray();
	this.uploadingFiles = ko.observableArray();

	this.rootPath = ko.observable(TextUtils.i18n('FILESTORAGE/TAB_PERSONAL_FILES'));
	this.storageType = ko.observable(Enums.FileStorageType.Personal);
	this.storageType.subscribe(function () {
		var 
			oStorage = null
		;
		if (this.isPublic)
		{
			this.rootPath(Settings.FileStoragePubParams.Name);
		}
		else
		{
			oStorage = this.getStorageByType(this.storageType());
			if (oStorage)
			{
				this.rootPath(oStorage.displayName());
			}
		}
		this.selector.listCheckedAndSelected(false);
	}, this);
	
	this.iPathIndex = ko.observable(-1);
	this.pathItems = ko.observableArray();
	this.dropPath = ko.observable('');
	this.path = ko.computed(function () {
		var aPath = _.map(this.pathItems(), function (oItem) {
			return oItem.id();
		});
		return aPath.join('/');
	}, this);

	this.path.subscribe(function (value) {
		this.dropPath(value);
	}, this);

	this.collection = ko.computed(function () {
		var files = _.union(this.files(), this.getUploadingFiles());

		files.sort(function(left, right) { 
			return left.fileName() === right.fileName() ? 0 : (left.fileName() < right.fileName() ? -1 : 1); 
		});
		
		return _.union(this.folders(), files);
	}, this);
	
	this.columnCount = ko.observable(1);
	
	this.selector = new CSelector(this.collection, null,
		_.bind(this.onItemDelete, this), _.bind(this.onItemDblClick, this), _.bind(this.onEnter, this), this.columnCount, true, true, true);
		
	this.searchPattern = ko.observable('');
	this.isSearchFocused = ko.observable(false);

	this.renameCommand = Utils.createCommand(this, this.executeRename, function () {
		var items = this.selector.listCheckedAndSelected();
		//return (1 === items.length && !items[0].isLink());
		return (1 === items.length);
	});
	this.deleteCommand = Utils.createCommand(this, this.executeDelete, function () {
		var items = this.selector.listCheckedAndSelected();
		return (0 < items.length);
	});
	this.downloadCommand = Utils.createCommand(this, this.executeDownload, function () {
		var items = this.selector.listCheckedAndSelected();
		return (1 === items.length && !items[0].isFolder());
	});
	this.shareCommand = Utils.createCommand(this, this.executeShare, function () {
		var items = this.selector.listCheckedAndSelected();
		return (1 === items.length && !items[0].isLink());
	});
	this.sendCommand = Utils.createCommand(this, this.executeSend, function () {
		var
			aItems = this.selector.listCheckedAndSelected(),
			aFileItems = _.filter(aItems, function (oItem) {
				return !oItem.isFolder();
			}, this)
		;
		return (aFileItems.length > 0);
	});
	
	this.uploaderButton = ko.observable(null);
	this.uploaderArea = ko.observable(null);
	this.bDragActive = ko.observable(false);//.extend({'throttle': 1});
//	this.bDragActive.subscribe(function () {
//		if (this.searchPattern() !== '')
//		{
//			this.bDragActive(false);
//		}
//	}, this);

	this.bDragActiveComp = ko.computed(function () {
		var bDrag = this.bDragActive();
		return bDrag && this.searchPattern() === '';
	}, this);
	
	this.bAllowDragNDrop = false;
	
	this.uploadError = ko.observable(false);
	
	this.quota = ko.observable(0);
	this.used = ko.observable(0);
	this.quotaDesc = ko.observable('');
	this.quotaProc = ko.observable(-1);
	
	ko.computed(function () {
		
		if (!Settings.ShowQuotaBar)
		{
			return true;
		}

		var
			iQuota = this.quota(),
			iUsed = this.used(),
			iProc = 0 < iQuota ? Math.ceil((iUsed / iQuota) * 100) : -1;

		iProc = 100 < iProc ? 100 : iProc;
		
		this.quotaProc(iProc);
		this.quotaDesc(-1 < iProc ?
			TextUtils.i18n('MAILBOX/QUOTA_TOOLTIP', {
				'PROC': iProc,
				'QUOTA': TextUtils.getFriendlySize(iQuota)
			}) : '');

		return true;
		
	}, this);
	
	this.dragover = ko.observable(false);
	
	this.loading = ko.observable(false);
	this.loadedFiles = ko.observable(false);

	this.fileListInfoText = ko.computed(function () {
		var sInfoText = '';
		
		if (this.loading())
		{
			sInfoText = TextUtils.i18n('FILESTORAGE/INFO_LOADING');
		}
		else if (this.loadedFiles())
		{
			if (this.collection().length === 0)
			{
				if (this.isPublic)
				{
					sInfoText = TextUtils.i18n('FILESTORAGE/INFO_PUBLIC_FOLDER_NOT_EXIST');
				}
				else
				{
					if (this.searchPattern() !== '' || this.isPublic)
					{
						sInfoText = TextUtils.i18n('FILESTORAGE/INFO_NO_ITEMS_FOUND');
					}
					else
					{
						if (this.path() !== '' || this.isPopup)
						{
							sInfoText = TextUtils.i18n('FILESTORAGE/INFO_FOLDER_IS_EMPTY');
						}
						else if (this.bAllowDragNDrop)
						{
							sInfoText = TextUtils.i18n('FILESTORAGE/INFO_FILESTORAGE_IS_EMPTY');
						}
					}
				}
			}
		}
		else if (this.error())
		{
			sInfoText = TextUtils.i18n('FILESTORAGE/ERROR_FILESTORAGE');
		}
		
		return sInfoText;
	}, this);
	
	this.dragAndDropHelperBinded = _.bind(this.dragAndDropHelper, this);
	this.isPopup = !!bPopup;
	this.isCurrentStorageExternal = ko.computed(function () {
		var oStorage = this.getStorageByType(this.storageType());
		return (oStorage && oStorage.isExternal());
	}, this);
	this.timerId = null;
}

_.extendOwn(CFilesView.prototype, CAbstractView.prototype);

CFilesView.prototype.ViewTemplate = 'Files_FilesView';
CFilesView.prototype.__name = 'CFilesView';

CFilesView.prototype.onBind = function ()
{
	this.selector.initOnApplyBindings(
		'.items_sub_list .item',
		'.items_sub_list .selected.item',
		'.items_sub_list .item .custom_checkbox',
		$('.panel.files .items_list', this.$viewDom),
		$('.panel.files .items_list .files_scroll.scroll-inner', this.$viewDom)
	);
	
	this.initUploader();

	this.hotKeysBind();
};

CFilesView.prototype.hotKeysBind = function ()
{
	$(document).on('keydown', _.bind(function(ev) {
		if (this.bShown && ev && ev.keyCode === Enums.Key.s && this.selector.useKeyboardKeys() && !Utils.isTextFieldFocused()) {
			ev.preventDefault();
			this.isSearchFocused(true);
		}
	}, this));
};

/**
 * Initializes file uploader.
 */
CFilesView.prototype.initUploader = function ()
{
	var self = this;
	
	if (this.uploaderButton() && this.uploaderArea())
	{
		this.oJua = new CJua({
			'action': '?/Upload/File/',
			'name': 'jua-uploader',
			'queueSize': 2,
			'clickElement': this.uploaderButton(),
			'hiddenElementsPosition': UserSettings.IsRTL ? 'right' : 'left',
			'dragAndDropElement': this.uploaderArea(),
			'disableAjaxUpload': this.isPublic ? true : false,
			'disableFolderDragAndDrop': this.isPublic ? true : false,
			'disableDragAndDrop': this.isPublic ? true : false,
			'hidden': {
				'Token': function () {
					return UserSettings.CsrfToken;
				},
				'AccountID': function () {
					return App.currentAccountId();
				},
				'AdditionalData':  function (oFile) {
					return JSON.stringify({
						'Type': self.storageType(),
						'SubPath': oFile && !Utils.isUnd(oFile['Folder']) ? oFile['Folder'] : '',
						'Path': self.dropPath()
					});
				}
			}
		});

		this.oJua
			.on('onProgress', _.bind(this.onFileUploadProgress, this))
			.on('onSelect', _.bind(this.onFileUploadSelect, this))
			.on('onStart', _.bind(this.onFileUploadStart, this))
			.on('onDrop', _.bind(this.onDrop, this))
			.on('onComplete', _.bind(this.onFileUploadComplete, this))
			.on('onBodyDragEnter', _.bind(this.bDragActive, this, true))
			.on('onBodyDragLeave', _.bind(this.bDragActive, this, false))
		;
		
		this.bAllowDragNDrop = this.oJua.isDragAndDropSupported();
	}
};

/**
 * Creates new attachment for upload.
 *
 * @param {string} sFileUid
 * @param {Object} oFileData
 */
CFilesView.prototype.onFileUploadSelect = function (sFileUid, oFileData)
{
	if (Settings.FileSizeLimit > 0 && oFileData.Size/(1024*1024) > Settings.FileSizeLimit)
	{
		Popups.showPopup(AlertPopup, [
			TextUtils.i18n('FILESTORAGE/ERROR_SIZE_LIMIT', {'SIZE': Settings.FileSizeLimit})
		]);
		return false;
	}	
	
	if (this.searchPattern() === '')
	{
		var 
			oFile = new CFileModel(),
			sFileName = oFileData.FileName,
			sFileNameExt = Utils.getFileExtension(sFileName),
			sFileNameWoExt = Utils.getFileNameWithoutExtension(sFileName),
			iIndex = 0
		;
		
		if (sFileNameExt !== '')
		{
			sFileNameExt = '.' + sFileNameExt;
		}

		while (!Utils.isUnd(this.getFileByName(sFileName)))
		{
			sFileName = sFileNameWoExt + '_' + iIndex + sFileNameExt;
			iIndex++;
		}
		
		oFile.onUploadSelectOwn(sFileUid, oFileData, sFileName, App.currentAccountEmail(), this.path(), this.storageType());
		
		this.uploadingFiles.push(oFile);
	}
};

/**
 * Finds attachment by uid. Calls it's function to start upload.
 *
 * @param {string} sFileUid
 */
CFilesView.prototype.onFileUploadStart = function (sFileUid)
{
	var oFile = this.getUploadFileByUid(sFileUid);

	if (oFile)
	{
		oFile.onUploadStart();
	}
};

/**
 * Finds attachment by uid. Calls it's function to progress upload.
 *
 * @param {string} sFileUid
 * @param {number} iUploadedSize
 * @param {number} iTotalSize
 */
CFilesView.prototype.onFileUploadProgress = function (sFileUid, iUploadedSize, iTotalSize)
{
	if (this.searchPattern() === '')
	{
		var oFile = this.getUploadFileByUid(sFileUid);

		if (oFile)
		{
			oFile.onUploadProgress(iUploadedSize, iTotalSize);
		}
	}
};

/**
 * Finds attachment by uid. Calls it's function to complete upload.
 *
 * @param {string} sFileUid
 * @param {boolean} bResponseReceived
 * @param {Object} oResult
 */
CFilesView.prototype.onFileUploadComplete = function (sFileUid, bResponseReceived, oResult)
{
	if (this.searchPattern() === '')
	{
		var
			oFile = this.getUploadFileByUid(sFileUid)
		;
		
		if (oFile)
		{
			oFile.onUploadComplete(sFileUid, bResponseReceived, oResult);
			
			this.deleteUploadFileByUid(sFileUid);
			
			if (oFile.uploadError())
			{
				this.uploadError(true);
				Screens.showError(oFile.statusText());
			}
			else
			{
				this.files.push(oFile);
				if (this.uploadingFiles().length === 0)
				{
					Screens.showReport(TextUtils.i18n('COMPOSE/UPLOAD_COMPLETE'));
				}
			}
		}

		this.getFiles(this.storageType(), this.getPathItemByIndex(this.iPathIndex()), this.searchPattern(), false);
	}
};

/**
 * @param {Object} oFile
 * @param {Object} oEvent
 */
CFilesView.prototype.onDrop = function (oFile, oEvent)
{
	if (this.isPublic)
	{
		return;
	}
		
	if (oEvent && oEvent.target && this.searchPattern() === '')
	{
		var oFolder = ko.dataFor(oEvent.target);
		if (oFolder && oFolder instanceof CFileModel && oFolder.isFolder())
		{
			this.dropPath(oFolder.fullPath());
		}
	}
	else
	{
		Screens.showReport(TextUtils.i18n('FILESTORAGE/INFO_CANNOT_UPLOAD_SEARCH_RESULT'));
	}
};

/**
 * @param {Object} oFolder
 * @param {Object} oEvent
 * @param {Object} oUi
 */
CFilesView.prototype.filesDrop = function (oFolder, oEvent, oUi)
{
	if (this.isPublic)
	{
		return;
	}

	if (oFolder && oEvent)
	{
		var
			self = this,
			sFromPath = '',
			bFolderIntoItself = false,
			sToPath = oFolder.fullPath(),
			aChecked = [],
			aItems = []
		;
		
		if (this.path() !== sToPath && this.storageType() === oFolder.storageType() || this.storageType() !== oFolder.storageType())
		{
			oFolder.recivedAnim(true);
			Utils.uiDropHelperAnim(oEvent, oUi);

			aChecked = this.selector.listCheckedAndSelected();
			_.each(aChecked, function (oItem) {
				sFromPath = oItem.path();
				bFolderIntoItself = oItem.isFolder() && sToPath === sFromPath + '/' + oItem.id();
				if (!bFolderIntoItself)
				{
					if (!oEvent.ctrlKey)
					{
						if (!oItem.isFolder())
						{
							self.deleteFileByName(oItem.id());
						}
						else
						{
							self.deleteFolderByName(oItem.fileName());
						}
					}
					aItems.push({
						'Name':  oItem.id(),
						'IsFolder': oItem.isFolder()
					});
				}
			});
			
			if (aItems.length > 0)
			{
				Ajax.send({
						'Action': oEvent.ctrlKey ? 'FilesCopy' : 'FilesMove',
						'FromType': this.storageType(),
						'ToType': oFolder.storageType(),
						'FromPath': sFromPath,
						'ToPath': sToPath,
						'Files': JSON.stringify(aItems)
					},
					this.onFilesMoveResponse,
					this
				);
			}
		}
	}
};

/**
 * @param {Object} oResult
 * @param {Object} oRequest
 */
CFilesView.prototype.onFilesMoveResponse = function (oResult, oRequest)
{
	this.getQuota(this.storageType());
};

/**
 * @param {Object} oFile
 */
CFilesView.prototype.dragAndDropHelper = function (oFile)
{
	if (oFile)
	{
		oFile.checked(true);
	}

	var
		oHelper = Utils.draggableItems(),
		aItems = this.selector.listCheckedAndSelected(),
		nCount = aItems.length,
		nFilesCount = 0,
		nFoldersCount = 0,
		sText = '';
	
	_.each(aItems, function (oItem) {
		if (oItem.isFolder())
		{
			nFoldersCount++;
		}
		else
		{
			nFilesCount++;
		}

	}, this);
	
	if (nFilesCount !== 0 && nFoldersCount !== 0)
	{
		sText = TextUtils.i18n('FILESTORAGE/DRAG_ITEMS_TEXT_PLURAL', {'COUNT': nCount}, null, nCount);
	}
	else if (nFilesCount === 0)
	{
		sText = TextUtils.i18n('FILESTORAGE/DRAG_FOLDERS_TEXT_PLURAL', {'COUNT': nFoldersCount}, null, nFoldersCount);
	}
	else if (nFoldersCount === 0)
	{
		sText = TextUtils.i18n('FILESTORAGE/DRAG_TEXT_PLURAL', {'COUNT': nFilesCount}, null, nFilesCount);
	}
	
	$('.count-text', oHelper).text(sText);

	return oHelper;
};

CFilesView.prototype.onItemDelete = function ()
{
	this.executeDelete();
};

/**
 * @param {{isFolder:Function,path:Function,name:Function,isViewable:Function,viewFile:Function,downloadFile:Function}} oItem
 */
CFilesView.prototype.onEnter = function (oItem)
{
	this.onItemDblClick(oItem);
};

/**
 * @param {{isFolder:Function,path:Function,name:Function,isViewable:Function,viewFile:Function,downloadFile:Function}} oItem
 */
CFilesView.prototype.onItemDblClick = function (oItem)
{
	if (oItem)
	{
		if (oItem.isFolder())
		{
			this.getFiles(this.storageType(), oItem);
		}
		else
		{
			if (oItem.isViewable())
			{
				oItem.viewFile();
			}
			else
			{
				if (this.isPopup)
				{
					if (this.onSelectClickPopupBinded)
					{
						this.onSelectClickPopupBinded();
					}
				}
				else
				{
					oItem.downloadFile();
				}
			}
		}
	}
};

/**
 * @param {Object} oResult
 * @param {Object} oRequest
 */
CFilesView.prototype.onFilesResponse = function (oResult, oRequest)
{
	if (oResult.Result)
	{
		var 
			aFolderList = [],
			aFileList = [],
			sThumbSessionUid = Date.now().toString()
		;

		if (oResult.Result.Quota)
		{
			this.quota(oResult.Result.Quota[0] + oResult.Result.Quota[1]);
			this.used(oResult.Result.Quota[0]);
		}
		
		_.each(oResult.Result.Items, function (oValue) {
			var oItem = new CFileModel()
				.allowDrag(true)
				.allowCheck(true)
				.allowDelete(true)
				.allowUpload(true)
				.allowSharing(true)
				.allowHeader(true)
				.allowDownload(true)
				.isPopupItem(this.isPopup);
				
			oItem.parse(oValue, this.publicHash);
			
			oItem.getInThumbQueue(sThumbSessionUid);
			if (oItem.isFolder())
			{
				aFolderList.push(oItem);
			}
			else
			{
				aFileList.push(oItem);
			}
		}, this);
		
		if (this.isPublic || oRequest.Type === this.storageType())
		{
			this.folders(aFolderList);
			this.files(aFileList);
		}
		
		this.loading(false);
		this.loadedFiles(true);
		clearTimeout(this.timerId);
	}
	else
	{
		this.loading(false);
		this.error(true);
	}
};

/**
 * @param {Object} oResult
 * @param {Object} oRequest
 */
CFilesView.prototype.onQuotaResponse = function (oResult, oRequest)
{
	if (oResult.Result && oResult.Result.Quota)
	{
		this.quota(oResult.Result.Quota[0] + oResult.Result.Quota[1]);
		this.used(oResult.Result.Quota[0]);
	}
};

/**
 * @param {Object} oResult
 * @param {Object} oRequest
 */
CFilesView.prototype.onFilesDeleteResponse = function (oResult, oRequest)
{
	if (oResult.Result)
	{
		this.expungeFileItems();
	}
	else
	{
		this.getFiles(this.storageType(), this.getPathItemByIndex(this.iPathIndex()), this.searchPattern());
	}
};

CFilesView.prototype.executeRename = function ()
{
	var
		aChecked = this.selector.listCheckedAndSelected()
	;
	if (!this.isPublic && aChecked[0])
	{
		Popups.showPopup(RenamePopup, [aChecked[0], _.bind(this.renameItem, this)]);
	}
};

CFilesView.prototype.executeDownload = function ()
{
	var 
		aChecked = this.selector.listCheckedAndSelected()
	;
	if (aChecked[0] && !aChecked[0].isFolder())
	{
		aChecked[0].downloadFile();
	}
};

CFilesView.prototype.executeShare = function ()
{
	var 
		aChecked = this.selector.listCheckedAndSelected()
	;
	if (!this.isPublic &&  aChecked[0])
	{
		Popups.showPopup(SharePopup, [aChecked[0]]);
	}
};

CFilesView.prototype.executeSend = function ()
{
	var
		aItems = this.selector.listCheckedAndSelected(),
		aFileItems = _.filter(aItems, function (oItem) {
			return !oItem.isFolder();
		}, this)
	;
	
	if (aFileItems.length > 0)
	{
//		App.Api.composeMessageWithFiles(aFileItems);
	}
};

/**
 * @param {Object} oItem
 */
CFilesView.prototype.onShareIconClick = function (oItem)
{
	if (oItem)
	{
		Popups.showPopup(SharePopup, [oItem]);
	}
};

/**
 * @param {Object} oItem
 * @return {string}
 */
CFilesView.prototype.renameItem = function (oItem)
{
	var sName = $.trim(oItem.nameForEdit());
	if (!Utils.validateFileOrFolderName(sName))
	{
		return oItem.isFolder() ?
			TextUtils.i18n('FILESTORAGE/INVALID_FOLDER_NAME') : TextUtils.i18n('FILESTORAGE/INVALID_FILE_NAME');
	}
	else
	{
		Ajax.send({
				'Action': 'FilesRename',
				'Type': this.storageType(),
				'Path': oItem.path(),
				'Name': oItem.id(),
				'NewName': sName,
				'IsLink': oItem.isLink() ? 1 : 0
			}, this.onFilesRenameResponse, this
		);
	}

	return '';
};

/**
 * @param {Object} oResult
 * @param {Object} oRequest
 */
CFilesView.prototype.onFilesRenameResponse = function (oResult, oRequest)
{
	this.getFiles(this.storageType(), this.getPathItemByIndex(this.iPathIndex()), this.searchPattern());
};


CFilesView.prototype.executeDelete = function ()
{
	var
		aChecked = this.selector.listCheckedAndSelected()
	;
	if (!this.isPublic && aChecked && aChecked.length > 0)
	{
		Popups.showPopup(ConfirmPopup, [TextUtils.i18n('FILESTORAGE/CONFIRMATION_DELETE'), _.bind(this.deleteItems, this, aChecked)]);
	}
};

CFilesView.prototype.onShow = function ()
{
//	if (!this.loaded() || this.isPopup)
//	{
		this.loaded(true);
		this.getStorages();
//	}

	this.selector.useKeyboardKeys(true);

	if (this.oJua)
	{
		this.oJua.setDragAndDropEnabledStatus(true);
	}
};

CFilesView.prototype.onHide = function ()
{
	this.selector.useKeyboardKeys(false);
	if (this.oJua)
	{
		this.oJua.setDragAndDropEnabledStatus(false);
	}
};

/**
 * @param {number} iType
 */
CFilesView.prototype.getQuota = function (iType)
{
	Ajax.send({
			'Action': 'FilesQuota',
			'Type': iType
		}, this.onQuotaResponse, this
	);
};

CFilesView.prototype.getStorageByType = function (storageType)
{
	return _.find(this.storages(), function(oStorageItem){ 
		return oStorageItem.storageType() === storageType; 
	});	
};

CFilesView.prototype.getStorages = function ()
{
//	this.storages.removeAll();
	
	if (!this.isPublic)
	{
		if (!this.getStorageByType('personal'))
		{
			this.storages.push(
				new CFileModel()
					.isFolder(true)
					.storageType('personal')
					.displayName(TextUtils.i18n('FILESTORAGE/TAB_PERSONAL_FILES'))
			);
		}
		if (this.IsCollaborationSupported)
		{
			if (!this.getStorageByType('corporate'))
			{
				this.storages.push(
					new CFileModel()
						.isFolder(true)
						.storageType('corporate')
						.displayName(TextUtils.i18n('FILESTORAGE/TAB_CORPORATE_FILES'))
				);
			}
			if (this.AllowFilesSharing)
			{
				if (!this.getStorageByType('shared'))
				{
					this.storages.push(
						new CFileModel()
							.isFolder(true)
							.storageType('shared')
							.displayName(TextUtils.i18n('FILESTORAGE/TAB_SHARED_FILES'))
					);
				}
			}
		}
		if (!this.isPopup)
		{
			this.getExternalFileStorages();
		}
		else
		{
			this.getFiles(this.storageType(), this.getPathItemByIndex(this.iPathIndex()));
		}
	}
	else
	{
		this.getFiles(this.storageType(), this.getPathItemByIndex(this.iPathIndex()));
	}
};

CFilesView.prototype.getExternalFileStorages = function ()
{
	Ajax.send({
			'Action': 'FileStoragesExternal'
		}, this.onExternalStoragesResponse, this
	);
};

/**
 * @param {Object} oResult
 * @param {Object} oRequest
 */
CFilesView.prototype.onExternalStoragesResponse = function (oResult, oRequest)
{
	if (oResult.Result)
	{
		_.each(oResult.Result, function(oStorage){
			if (!this.getStorageByType(oStorage.Type))
			{
				this.storages.push(
					new CFileModel()
						.isExternal(true)
						.isFolder(true)
						.storageType(oStorage.Type)
						.displayName(oStorage.DisplayName)
				);
			}
		}, this);
		
		this.expungeExternalStorages(_.map(oResult.Result, function(oStorage){
			return oStorage.Type;
		}, this));
	}
	if (!this.getStorageByType(this.storageType()))
	{
		this.storageType('personal');
		this.pathItems([]);
		this.iPathIndex(-1);
	}
	
	this.getFiles(this.storageType(), this.getPathItemByIndex(this.iPathIndex()));
};

/**
 * @param {string} sType
 * @param {object=} oPath = ''
 * @param {string=} sPattern = ''
 * @param {boolean=} bLoading = true
 */
CFilesView.prototype.getFiles = function (sType, oPath, sPattern, bLoading)
{
	var 
		self = this,
		sTypePrev = this.storageType(),
		iPathIndex = this.iPathIndex(),
		oFolder = new CFileModel()
			.isFolder(true)
			.storageType(sType)
	;
	if (this.isPublic)
	{
		return this.getFilesPub(oPath);
	}
	this.error(false);
	this.storageType(sType);
	self.loadedFiles(false);
	if (Utils.isUnd(bLoading) || !Utils.isUnd(bLoading) && bLoading)
	{
		this.timerId = setTimeout(function() {
			if (!self.loadedFiles() && !self.error())
			{
				self.folders([]);
				self.files([]);
				self.loading(true);
			}
		}, 1500);				
	}
	
	this.searchPattern(Utils.isUnd(sPattern) ? '' : Utils.pString(sPattern));
	if (Utils.isUnd(oPath) || oPath.id() === '')
	{
		this.pathItems.removeAll();
		oFolder.displayName(this.rootPath());
	}
	else
	{
		oFolder = oPath;
	}

	this.pathItems.push(oFolder);
	this.iPathIndex(this.pathItems().length - 1);
	
	if (iPathIndex !== this.iPathIndex() || sTypePrev !== this.storageType())
	{
		this.folders([]);
		this.files([]);
	}
	
	Ajax.sendExt({
			'Action': 'Files',
			'Type': sType,
			'Path': this.path(),
			'Pattern': this.searchPattern()
		}, this.onFilesResponse, this
	);
};

/**
 * @param {string} sHash
 */
CFilesView.prototype.getFilesPub = function (oPath)
{
	var 
		iPathIndex = this.iPathIndex(),
		oFolder = new CFileModel()
			.isFolder(true)
	;
	if (Utils.isUnd(oPath) || oPath.id() === '')
	{
		this.pathItems.removeAll();
		oFolder.displayName(this.rootPath());
	}
	else
	{
		oFolder = oPath;
	}
	
	this.pathItems.push(oFolder);
	
	this.iPathIndex(this.pathItems().length - 1);
	
	if (iPathIndex !== this.iPathIndex())
	{
		this.folders([]);
		this.files([]);
	}
	
	Ajax.sendExt({
			'Action': 'FilesPub',
			'Hash': Settings.FileStoragePubHash,
			'Path': this.path()
		}, this.onFilesResponse, this
	);
};

/**
 * @param {Array} aChecked
 * @param {boolean} bOkAnswer
 */
CFilesView.prototype.deleteItems = function (aChecked, bOkAnswer)
{
	if (bOkAnswer && 0 < aChecked.length)
	{
		var
			aItems = _.map(aChecked, function (oItem) {
				oItem.deleted(true);
				return {
					'Path': oItem.path(),  
					'Name': oItem.id()
				};
			});
		
		Ajax.send({
				'Action': 'FilesDelete',
				'Type': this.storageType(),
				'Path': this.path(),
				'Items': JSON.stringify(aItems)		
			}, this.onFilesDeleteResponse, this
		);
	}		
};

/**
 * @param {number} iIndex
 * 
 * @return {string}
 */
CFilesView.prototype.getPathItemByIndex = function (iIndex)
{
	var 
		oItem = this.pathItems()[iIndex],
		oResult = new CFileModel().fileName(this.rootPath()).id('')
	;
	
	this.pathItems(this.pathItems().slice(0, iIndex));
	if (oItem && !this.isPublic)
	{
		oResult = oItem;
	}
	return oResult;
};

/**
 * @param {number} iIndex
 * 
 * @return {string}
 */
CFilesView.prototype.getFullPathByIndex = function (iIndex)
{
	var 
		aPath = _.map(this.pathItems().slice(0, iIndex), function (oItem){
			return oItem.fileName();
		});
	
	return aPath.join('/');
};

/**
 * @param {string} sName
 * 
 * @return {?}
 */
CFilesView.prototype.getFileByName = function (sName)
{
	return _.find(this.files(), function(oItem){
		return oItem.id() === sName;
	});	
};

/**
 * @param {string} sName
 */
CFilesView.prototype.deleteFileByName = function (sName)
{
	this.files(_.filter(this.files(), function (oItem) {
		return oItem.id() !== sName;
	}));
};

/**
 * @param {string} sName
 */
CFilesView.prototype.deleteFolderByName = function (sName)
{
	this.folders(_.filter(this.folders(), function (oItem) {
		return oItem.fileName() !== sName;
	}));
};

/**
 * @param {string} sName
 */
CFilesView.prototype.expungeFileItems = function ()
{
	this.folders(_.filter(this.folders(), function(oFolder){
		return !oFolder.deleted();
	}, this));
	this.files(_.filter(this.files(), function(oFile){
		return !oFile.deleted();
	}, this));
};

/**
 * @param {array} aStorageTypes
 */
CFilesView.prototype.expungeExternalStorages = function (aStorageTypes)
{
	this.storages(_.filter(this.storages(), function(oStorage){
		return !oStorage.isExternal() || _.include(aStorageTypes, oStorage.storageType());
	},this));
};

/**
 * @param {int} iType
 */
CFilesView.prototype.deleteStorageByType = function (iType)
{
	this.storages(_.filter(this.storages(), function (oItem) {
		return oItem.storageType() !== iType;
	}));
};


/**
 * @param {string} sFileUid
 * 
 * @return {?}
 */
CFilesView.prototype.getUploadFileByUid = function (sFileUid)
{
	return _.find(this.uploadingFiles(), function(oItem){
		return oItem.uploadUid() === sFileUid;
	});	
};

/**
 * @param {string} sFileUid
 */
CFilesView.prototype.deleteUploadFileByUid = function (sFileUid)
{
	this.uploadingFiles(_.filter(this.uploadingFiles(), function (oItem) {
		return oItem.uploadUid() !== sFileUid;
	}));
};

/**
 * @return {Array}
 */
CFilesView.prototype.getUploadingFiles = function ()
{
	var 
		aResult = [],
		uploadingFiles = this.uploadingFiles(),
		self = this
	;
	
	if (!Utils.isUnd(uploadingFiles))
	{
		aResult = _.filter(uploadingFiles, function(oItem){
			return oItem.path() === self.path() && oItem.storageType() === self.storageType();
		});	
	}
	return aResult;
};

/**
 * @param {string} sFileUid
 */
CFilesView.prototype.onCancelUpload = function (sFileUid)
{
	if (this.oJua)
	{
		this.oJua.cancel(sFileUid);
	}
	this.deleteUploadFileByUid(sFileUid);
};

/**
 * @param {Object} oResult
 * @param {Object} oRequest
 */
CFilesView.prototype.onCreateFolderResponse = function (oResult, oRequest)
{
	this.getFiles(this.storageType(), this.getPathItemByIndex(this.iPathIndex()));
};

/**
 * @param {string} sFolderName
 */
CFilesView.prototype.createFolder = function (sFolderName)
{
	sFolderName = $.trim(sFolderName);
	if (!Utils.validateFileOrFolderName(sFolderName))
	{
		return TextUtils.i18n('FILESTORAGE/INVALID_FOLDER_NAME');
	}
	else
	{
		Ajax.send({
				'Action': 'FilesFolderCreate',
				'Type': this.storageType(),
				'Path': this.path(),
				'FolderName': sFolderName
			}, this.onCreateFolderResponse, this
		);
	}

	return '';
};

CFilesView.prototype.onCreateFolderClick = function ()
{
	Popups.showPopup(CreateFolderPopup, [_.bind(this.createFolder, this)]);
};

/**
 * @param {Object} oResult
 * @param {Object} oRequest
 */
CFilesView.prototype.onCreateLinkResponse = function (oResult, oRequest)
{
	this.getFiles(this.storageType(), this.getPathItemByIndex(this.iPathIndex()));
};

/**
 * @param {Object} oFileItem
 */
CFilesView.prototype.createLink = function (oFileItem)
{
		Ajax.send({
			'Action': 'FilesLinkCreate',
			'Type': this.storageType(),
			'Path': this.path(),
			'Link': oFileItem.linkUrl(),
			'Name': oFileItem.fileName()
		}, this.onCreateLinkResponse, this
	);
		
};

CFilesView.prototype.onCreateLinkClick = function ()
{
	var fCallBack = _.bind(this.createLink, this);

	Popups.showPopup(CreateLinkPopup, [fCallBack]);
	
};


CFilesView.prototype.onSearch = function ()
{
	this.getFiles(this.storageType(), this.getPathItemByIndex(this.iPathIndex()), this.searchPattern());
};

CFilesView.prototype.clearSearch = function ()
{
	this.getFiles(this.storageType(), this.getPathItemByIndex(this.iPathIndex()));
};

module.exports = CFilesView;