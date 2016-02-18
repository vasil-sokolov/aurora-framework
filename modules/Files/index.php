<?php

class FilesModule extends AApiModule
{
	public $oApiFilesManager = null;
	
	public function init() 
	{
		$this->oApiFilesManager = $this->GetManager('main', 'sabredav');
		
		$this->AddEntry('files-pub', 'EntryFilesPub');
	}
	
	private function GetRawFile($bDownload = true, $bThumbnail = false)
	{
		$sRawKey = (string) $this->getParamValue('RawKey', '');
		$aValues = \CApi::DecodeKeyValues($sRawKey);

		$sType = (string) $this->getParamValue('Type');
		$sPath = (string) $this->getParamValue('Path');
		$sName = (string) $this->getParamValue('Name');

		if ($bThumbnail)
		{
//			$this->verifyCacheByKey($sRawKey); // todo
		}
		
		$sHash = (string) $this->getParamValue('TenantHash', '');
		$oApiUsers = \CApi::GetCoreManager('users');

		$mMin = \CApi::ExecuteMethod('Min::GetMinByHash', array('Hash' => $sHash));
		$oAccount = null;
		if (!empty($mMin['__hash__'])) {
			
			$oAccount = $oApiUsers->getAccountById($mMin['Account']);
		} else {
			
			$mIframed = $this->getParamValue('Iframed');
			$mTime = $this->getParamValue('Time');

			if (isset($mIframed, $mTime) && $mIframed && $mTime) {
				
				$oAccount = $this->getAccountFromParam(true, !($mTime > \api_Utils::iframedTimestamp()));

				if (!$oAccount->IsDefaultAccount) {
					
					$iAccountId = $oApiUsers->getDefaultAccountId($oAccount->IdUser);
					if (0 < $iAccountId) {
						
						$oAccount = $oApiUsers->getAccountById($iAccountId);
					} else {
						
						throw new \Core\Exceptions\ClientException(\Core\Notifications::AuthError);
					}
				}
			} else {
				
				$oAccount = $this->getDefaultAccountFromParam();
			}
		}

		$oTenant = null;
		$oApiTenants = \CApi::GetCoreManager('tenants');
		
		if ($oAccount && $oApiTenants) {
			$oTenant = (0 < $oAccount->IdTenant) ? $oApiTenants->getTenantById($oAccount->IdTenant) :
				$oApiTenants->getDefaultGlobalTenant();
		}
		
		if ($this->oApiCapabilityManager->isFilesSupported($oAccount) && 
				$oTenant && isset($sType, $sPath, $sName)) {
			
			$mResult = false;
			
			$sFileName = $sName;
			$sContentType = (empty($sFileName)) ? 'text/plain' : \MailSo\Base\Utils::MimeContentType($sFileName);
			
			$oFileInfo = $this->oApiFilesManager->getFileInfo($oAccount, $sType, $sPath, $sName);
			if ($oFileInfo->IsLink) {
				
				$iLinkType = \api_Utils::GetLinkType($oFileInfo->LinkUrl);

				if (isset($iLinkType)) {
					
					if (\EFileStorageLinkType::GoogleDrive === $iLinkType) {
						
						$oSocial = $oTenant->getSocialByName('google');
						if ($oSocial) {
							
							$oInfo = \api_Utils::GetGoogleDriveFileInfo($oFileInfo->LinkUrl, $oSocial->SocialApiKey);
							$sFileName = isset($oInfo->title) ? $oInfo->title : $sFileName;
							$sContentType = \MailSo\Base\Utils::MimeContentType($sFileName);

							if (isset($oInfo->downloadUrl)) {
								
								$mResult = \MailSo\Base\ResourceRegistry::CreateMemoryResource();
								$this->oHttp->SaveUrlToFile($oInfo->downloadUrl, $mResult); // todo
								rewind($mResult);
							}
						}
					} else/* if (\EFileStorageLinkType::DropBox === (int)$aFileInfo['LinkType'])*/ {
						
						if (\EFileStorageLinkType::DropBox === $iLinkType) {
							
							$oFileInfo->LinkUrl = str_replace('www.dropbox.com', 'dl.dropboxusercontent.com', $oFileInfo->LinkUrl);
						}
						$mResult = \MailSo\Base\ResourceRegistry::CreateMemoryResource();
						$sFileName = basename($oFileInfo->LinkUrl);
						$sContentType = \MailSo\Base\Utils::MimeContentType($sFileName);
						
						$this->oHttp->SaveUrlToFile($oFileInfo->LinkUrl, $mResult); // todo
						rewind($mResult);
					}
				}
			} else {
				
				$mResult = $this->oApiFilesManager->getFile($oAccount, $sType, $sPath, $sName);
			}
			if (false !== $mResult) {
				
				if (is_resource($mResult)) {
					
//					$sFileName = $this->clearFileName($oFileInfo->Name, $sContentType); // todo
					$sContentType = \MailSo\Base\Utils::MimeContentType($sFileName);
					\CApiResponseManager::OutputHeaders($bDownload, $sContentType, $sFileName);
			
					if ($bThumbnail) {
						
//						$this->cacheByKey($sRawKey);	// todo
						\CApiResponseManager::GetThumbResource($oAccount, $mResult, $sFileName);
					} else if ($sContentType === 'text/html') {
						
						echo(\MailSo\Base\HtmlUtils::ClearHtmlSimple(stream_get_contents($mResult)));
					} else {
						
						\MailSo\Base\Utils::FpassthruWithTimeLimitReset($mResult);
					}
					
					@fclose($mResult);
				}

				return true;
			}
		}

		return false;		
	}
	
	public function UploadFile()
	{
		$oAccount = $this->getDefaultAccountFromParam();
		$oApiFileCacheManager = \CApi::GetCoreManager('filecache');

		$aFileData = $this->getParamValue('FileData', null);
		$mAdditionalData = @json_decode(
				$this->getParamValue('AdditionalData', '{}'), true
		);
		
		$sError = '';
		$aResponse = array();

		if ($oAccount) {
			
			if (is_array($aFileData)) {
				
				$sUploadName = $aFileData['name'];
				$iSize = (int) $aFileData['size'];
				$sType = isset($mAdditionalData['Type']) ? $mAdditionalData['Type'] : 'personal';
				$sPath = isset($mAdditionalData['Path']) ? $mAdditionalData['Path'] : '';
				$sMimeType = \MailSo\Base\Utils::MimeContentType($sUploadName);

				$sSavedName = 'upload-post-'.md5($aFileData['name'].$aFileData['tmp_name']);
				$rData = false;
				if (is_resource($aFileData['tmp_name']))
				{
					$rData = $aFileData['tmp_name'];
				}
				else if ($oApiFileCacheManager->moveUploadedFile($oAccount, $sSavedName, $aFileData['tmp_name']))
				{
					$rData = $oApiFileCacheManager->getFile($oAccount, $sSavedName);
				}
				if ($rData)
				{
					$this->oApiFilesManager->createFile($oAccount, $sType, $sPath, $sUploadName, $rData, false);

					$aResponse['File'] = array(
						'Name' => $sUploadName,
						'TempName' => $sSavedName,
						'MimeType' => $sMimeType,
						'Size' =>  (int) $iSize,
						'Hash' => \CApi::EncodeKeyValues(array(
							'TempFile' => true,
							'AccountID' => $oAccount->IdAccount,
							'Name' => $sUploadName,
							'TempName' => $sSavedName
						))
					);
				}
			}
		}
		else
		{
			$sError = 'auth';
		}

		if (0 < strlen($sError))
		{
			$aResponse['Error'] = $sError;
		}
		
		return $aResponse;
	}
	
	public function DownloadFile()
	{
		return $this->GetRawFile(true);
	}
	
	public function ViewFile()
	{
		return $this->GetRawFile(false);
	}

	public function GetFileThumbnail()
	{
		return $this->GetRawFile(false, true);
	}

	public function GetExternalStorages()
	{
		$oAccount = $this->getDefaultAccountFromParam();
		if (!$this->oApiCapabilityManager->isFilesSupported($oAccount))
		{
			throw new \Core\Exceptions\ClientException(\Core\Notifications::FilesNotAllowed);
		}
		
		$oResult = array();
		\CApi::Plugin()->RunHook('filestorage.get-external-storages', array($oAccount, &$oResult));

		return $oResult;
	}

	public function GetFiles()
	{
		$oAccount = $this->getDefaultAccountFromParam();
		if (!$this->oApiCapabilityManager->isFilesSupported($oAccount))
		{
			throw new \Core\Exceptions\ClientException(\Core\Notifications::FilesNotAllowed);
		}

		$sPath = $this->getParamValue('Path');
		$sType = $this->getParamValue('Type');
		$sPattern = $this->getParamValue('Pattern');
		
		return array(
			'Items' => $this->oApiFilesManager->getFiles($oAccount, $sType, $sPath, $sPattern),
			'Quota' => $this->oApiFilesManager->getQuota($oAccount)
		);
	}	

	public function GetPublicFiles()
	{
		$oAccount = null;
		$oResult = array();

		$sHash = $this->getParamValue('Hash');
		$sPath = $this->getParamValue('Path', '');
		
		$mMin = \CApi::ExecuteMethod('Min::GetMinByHash', array('Hash' => $sHash));
		if (!empty($mMin['__hash__'])) {
			
			$oApiUsers = \CApi::GetCoreManager('users');
			$oAccount = $oApiUsers->getAccountById($mMin['Account']);
			if ($oAccount) {
				
				if (!$this->oApiCapabilityManager->isFilesSupported($oAccount)) {
					
					throw new \Core\Exceptions\ClientException(\Core\Notifications::FilesNotAllowed);
				}
				$sPath =  implode('/', array($mMin['Path'], $mMin['Name']))  . $sPath;

				$oResult['Items'] = $this->oApiFilesManager->getFiles($oAccount, $mMin['Type'], $sPath);
				$oResult['Quota'] = $this->oApiFilesManager->getQuota($oAccount);
				
			}
		}

		return $oResult;
	}	

	public function GetQuota()
	{
		$oAccount = $this->getDefaultAccountFromParam();
		if (!$this->oApiCapabilityManager->isFilesSupported($oAccount)) {
			
			throw new \Core\Exceptions\ClientException(\Core\Notifications::FilesNotAllowed);
		}
		
		return array(
				'Quota' => $this->oApiFilesManager->getQuota($oAccount)
		);
	}	

	public function CreateFolder()
	{
		$oAccount = $this->getDefaultAccountFromParam();
		if (!$this->oApiCapabilityManager->isFilesSupported($oAccount)) {
			
			throw new \Core\Exceptions\ClientException(\Core\Notifications::FilesNotAllowed);
		}

		$sType = $this->getParamValue('Type');
		$sPath = $this->getParamValue('Path');
		$sFolderName = $this->getParamValue('FolderName');
		
		return $this->oApiFilesManager->createFolder($oAccount, $sType, $sPath, $sFolderName);
	}
	
	public function CreateLink()
	{
		$oAccount = $this->getDefaultAccountFromParam();
		if (!$this->oApiCapabilityManager->isFilesSupported($oAccount))
		{
			throw new \Core\Exceptions\ClientException(\Core\Notifications::FilesNotAllowed);
		}

		$sType = $this->getParamValue('Type');
		$sPath = $this->getParamValue('Path');
		$sLink = $this->getParamValue('Link');
		$sName = $this->getParamValue('Name');
		
		return $this->oApiFilesManager->createLink($oAccount, $sType, $sPath, $sLink, $sName);
	}
	
	public function Delete()
	{
		$oAccount = $this->getDefaultAccountFromParam();
		if (!$this->oApiCapabilityManager->isFilesSupported($oAccount))
		{
			throw new \Core\Exceptions\ClientException(\Core\Notifications::FilesNotAllowed);
		}

		$sType = $this->getParamValue('Type');
		$aItems = @json_decode($this->getParamValue('Items'), true);
		$oResult = false;
		
		foreach ($aItems as $oItem)
		{
			$oResult = $this->oApiFilesManager->delete($oAccount, $sType, $oItem['Path'], $oItem['Name']);
		}
		
		return $oResult;
	}	

	public function Rename()
	{
		$oAccount = $this->getDefaultAccountFromParam();
		if (!$this->oApiCapabilityManager->isFilesSupported($oAccount))
		{
			throw new \Core\Exceptions\ClientException(\Core\Notifications::FilesNotAllowed);
		}
		
		$sType = $this->getParamValue('Type');
		$sPath = $this->getParamValue('Path');
		$sName = $this->getParamValue('Name');
		$sNewName = $this->getParamValue('NewName');
		$bIsLink = !!$this->getParamValue('IsLink');
		$sNewName = \trim(\MailSo\Base\Utils::ClearFileName($sNewName));
		
		$sNewName = $this->oApiFilesManager->getNonExistingFileName($oAccount, $sType, $sPath, $sNewName);
		return $this->oApiFilesManager->rename($oAccount, $sType, $sPath, $sName, $sNewName, $bIsLink);
	}	

	public function Copy()
	{
		$oAccount = $this->getDefaultAccountFromParam();
		if (!$this->oApiCapabilityManager->isFilesSupported($oAccount))
		{
			throw new \Core\Exceptions\ClientException(\Core\Notifications::FilesNotAllowed);
		}

		$sFromType = $this->getParamValue('FromType');
		$sToType = $this->getParamValue('ToType');
		$sFromPath = $this->getParamValue('FromPath');
		$sToPath = $this->getParamValue('ToPath');
		$aItems = @json_decode($this->getParamValue('Files'), true);
		$oResult = null;
		
		foreach ($aItems as $aItem)
		{
			$bFolderIntoItself = $aItem['IsFolder'] && $sToPath === $sFromPath.'/'.$aItem['Name'];
			if (!$bFolderIntoItself)
			{
				$sNewName = $this->oApiFilesManager->getNonExistingFileName($oAccount, $sToType, $sToPath, $aItem['Name']);
				$oResult = $this->oApiFilesManager->copy($oAccount, $sFromType, $sToType, $sFromPath, $sToPath, $aItem['Name'], $sNewName);
			}
		}
		return $oResult;
	}	

	public function Move()
	{
		$oAccount = $this->getDefaultAccountFromParam();
		if (!$this->oApiCapabilityManager->isFilesSupported($oAccount))
		{
			throw new \Core\Exceptions\ClientException(\Core\Notifications::FilesNotAllowed);
		}
		
		$sFromType = $this->getParamValue('FromType');
		$sToType = $this->getParamValue('ToType');
		$sFromPath = $this->getParamValue('FromPath');
		$sToPath = $this->getParamValue('ToPath');
		$aItems = @json_decode($this->getParamValue('Files'), true);
		$oResult = null;
		
		foreach ($aItems as $aItem)
		{
			$bFolderIntoItself = $aItem['IsFolder'] && $sToPath === $sFromPath.'/'.$aItem['Name'];
			if (!$bFolderIntoItself)
			{
				$sNewName = $this->oApiFilesManager->getNonExistingFileName($oAccount, $sToType, $sToPath, $aItem['Name']);
				$oResult = $this->oApiFilesManager->move($oAccount, $sFromType, $sToType, $sFromPath, $sToPath, $aItem['Name'], $sNewName);
			}
		}
		return $oResult;
	}	
	
	public function CreatePublicLink()
	{
		$oAccount = $this->getDefaultAccountFromParam();
		if (!$this->oApiCapabilityManager->isFilesSupported($oAccount))
		{
			throw new \Core\Exceptions\ClientException(\Core\Notifications::FilesNotAllowed);
		}
		
		$sType = $this->getParamValue('Type'); 
		$sPath = $this->getParamValue('Path'); 
		$sName = $this->getParamValue('Name');
		$sSize = $this->getParamValue('Size');
		$bIsFolder = $this->getParamValue('IsFolder', '0') === '1' ? true : false;
		
		return $this->oApiFilesManager->createPublicLink($oAccount, $sType, $sPath, $sName, $sSize, $bIsFolder);
	}	
	
	public function DeletePublicLink()
	{
		$oAccount = $this->getDefaultAccountFromParam();
		if (!$this->oApiCapabilityManager->isFilesSupported($oAccount))
		{
			throw new \Core\Exceptions\ClientException(\Core\Notifications::FilesNotAllowed);
		}
		
		$sType = $this->getParamValue('Type'); 
		$sPath = $this->getParamValue('Path'); 
		$sName = $this->getParamValue('Name');
		
		return $this->oApiFilesManager->deletePublicLink($oAccount, $sType, $sPath, $sName);
	}
	
	/**
	 * @return array
	 */
	public function CheckUrl()
	{
		$oAccount = $this->getDefaultAccountFromParam();
		$mResult = false;

		if ($oAccount)
		{
			$sUrl = trim($this->getParamValue('Url', ''));

			if (!empty($sUrl))
			{
				$iLinkType = \api_Utils::GetLinkType($sUrl);
				if ($iLinkType === \EFileStorageLinkType::GoogleDrive)
				{
					$oApiTenants = \CApi::GetCoreManager('tenants');
					if ($oApiTenants)
					{
						$oTenant = (0 < $oAccount->IdTenant) ? $oApiTenants->getTenantById($oAccount->IdTenant) :
							$oApiTenants->getDefaultGlobalTenant();
					}
					$oSocial = $oTenant->getSocialByName('google');
					if ($oSocial)
					{
						$oInfo = \api_Utils::GetGoogleDriveFileInfo($sUrl, $oSocial->SocialApiKey);
						if ($oInfo)
						{
							$mResult['Size'] = 0;
							if (isset($oInfo->fileSize))
							{
								$mResult['Size'] = $oInfo->fileSize;
							}
							else
							{
								$aRemoteFileInfo = \api_Utils::GetRemoteFileInfo($sUrl);
								$mResult['Size'] = $aRemoteFileInfo['size'];
							}
							$mResult['Name'] = isset($oInfo->title) ? $oInfo->title : '';
							$mResult['Thumb'] = isset($oInfo->thumbnailLink) ? $oInfo->thumbnailLink : null;
						}
					}
				}
				else
				{
					//$sUrl = \api_Utils::GetRemoteFileRealUrl($sUrl);
					$oInfo = \api_Utils::GetOembedFileInfo($sUrl);
					if ($oInfo)
					{
						$mResult['Size'] = isset($oInfo->fileSize) ? $oInfo->fileSize : '';
						$mResult['Name'] = isset($oInfo->title) ? $oInfo->title : '';
						$mResult['LinkType'] = $iLinkType;
						$mResult['Thumb'] = isset($oInfo->thumbnail_url) ? $oInfo->thumbnail_url : null;
					}
					else
					{
						if (\api_Utils::GetLinkType($sUrl) === \EFileStorageLinkType::DropBox)
						{
							$sUrl = str_replace('?dl=0', '', $sUrl);
						}

						$sUrl = \api_Utils::GetRemoteFileRealUrl($sUrl);
						if ($sUrl)
						{
							$aRemoteFileInfo = \api_Utils::GetRemoteFileInfo($sUrl);
							$sFileName = basename($sUrl);
							$sFileExtension = \api_Utils::GetFileExtension($sFileName);

							if (empty($sFileExtension))
							{
								$sFileExtension = \api_Utils::GetFileExtensionFromMimeContentType($aRemoteFileInfo['content-type']);
								$sFileName .= '.'.$sFileExtension;
							}

							if ($sFileExtension === 'htm')
							{
								$oCurl = curl_init();
								\curl_setopt_array($oCurl, array(
									CURLOPT_URL => $sUrl,
									CURLOPT_FOLLOWLOCATION => true,
									CURLOPT_ENCODING => '',
									CURLOPT_RETURNTRANSFER => true,
									CURLOPT_AUTOREFERER => true,
									CURLOPT_SSL_VERIFYPEER => false, //required for https urls
									CURLOPT_CONNECTTIMEOUT => 5,
									CURLOPT_TIMEOUT => 5,
									CURLOPT_MAXREDIRS => 5
								));
								$sContent = curl_exec($oCurl);
								//$aInfo = curl_getinfo($oCurl);
								curl_close($oCurl);

								preg_match('/<title>(.*?)<\/title>/s', $sContent, $aTitle);
								$sTitle = isset($aTitle['1']) ? trim($aTitle['1']) : '';
							}

							$mResult['Name'] = isset($sTitle) && strlen($sTitle)> 0 ? $sTitle : urldecode($sFileName);
							$mResult['Size'] = $aRemoteFileInfo['size'];
						}
					}
				}
			}
		}
		
		return $mResult;
	}	
	
	public function EntryFilesPub()
	{
		$sResult = '';
		
		$sFilesPub = \MailSo\Base\Http::NewInstance()->GetQuery('files-pub');
		$mData = \CApi::ExecuteMethod('Min::GetMinByHash', array('Hash' => $sFilesPub));
		
		if (is_array($mData) && isset($mData['IsFolder']) && $mData['IsFolder'])
		{
			$oApiIntegrator = \CApi::GetCoreManager('integrator');

			if ($oApiIntegrator)
			{
				$oCoreModule = \CApi::GetModule('Core');
				if ($oCoreModule instanceof \AApiModule) {
					$sResult = file_get_contents($oCoreModule->GetPath().'/templates/Index.html');
					if (is_string($sResult)) {
						$sFrameOptions = \CApi::GetConf('labs.x-frame-options', '');
						if (0 < \strlen($sFrameOptions)) {
							@\header('X-Frame-Options: '.$sFrameOptions);
						}

						$sAuthToken = isset($_COOKIE[\Core\Service::AUTH_TOKEN_KEY]) ? $_COOKIE[\Core\Service::AUTH_TOKEN_KEY] : '';
						$sResult = strtr($sResult, array(
							'{{AppVersion}}' => PSEVEN_APP_VERSION,
							'{{IntegratorDir}}' => $oApiIntegrator->isRtl($sAuthToken) ? 'rtl' : 'ltr',
							'{{IntegratorLinks}}' => $oApiIntegrator->buildHeadersLink($sAuthToken, '', '', $sFilesPub),
							'{{IntegratorBody}}' => $oApiIntegrator->buildBody($sAuthToken, '', '', $sFilesPub)
						));
					}
				}
			}
		}
		else if ($mData && isset($mData['__hash__'], $mData['Name'], $mData['Size']))
		{
			$sUrl = (bool) \CApi::GetConf('labs.server-use-url-rewrite', false) ? '/download/' : '?/Min/Download/';

			$sUrlRewriteBase = (string) \CApi::GetConf('labs.server-url-rewrite-base', '');
			if (!empty($sUrlRewriteBase))
			{
				$sUrlRewriteBase = '<base href="'.$sUrlRewriteBase.'" />';
			}

			$sResult = file_get_contents($this->GetPath().'/templates/FilesPub.html');
			if (is_string($sResult))
			{
				$sResult = strtr($sResult, array(
					'{{Url}}' => $sUrl.$mData['__hash__'], 
					'{{FileName}}' => $mData['Name'],
					'{{FileSize}}' => \api_Utils::GetFriendlySize($mData['Size']),
					'{{FileType}}' => \api_Utils::GetFileExtension($mData['Name']),
					'{{BaseUrl}}' => $sUrlRewriteBase 
				));
			}
			else
			{
				\CApi::Log('Empty template.', \ELogLevel::Error);
			}
		}

		return $sResult;
	}
	
	/**
	 * @return array
	 */
	public function MinShare()
	{
		$mData = $this->getParamValue('Result', false);

		if ($mData && isset($mData['__hash__'], $mData['Name'], $mData['Size']))
		{
			$bUseUrlRewrite = (bool) \CApi::GetConf('labs.server-use-url-rewrite', false);			
			$sUrl = '?/Min/Download/';
			if ($bUseUrlRewrite)
			{
				$sUrl = '/download/';
			}
			
			$sUrlRewriteBase = (string) \CApi::GetConf('labs.server-url-rewrite-base', '');
			if (!empty($sUrlRewriteBase))
			{
				$sUrlRewriteBase = '<base href="'.$sUrlRewriteBase.'" />';
			}
		
			return array(
				'Template' => 'templates/FilesPub.html',
				'{{Url}}' => $sUrl.$mData['__hash__'], 
				'{{FileName}}' => $mData['Name'],
				'{{FileSize}}' => \api_Utils::GetFriendlySize($mData['Size']),
				'{{FileType}}' => \api_Utils::GetFileExtension($mData['Name']),
				'{{BaseUrl}}' => $sUrlRewriteBase 
			);
		}
		return false;
	}	

}

return new FilesModule('1.0');
