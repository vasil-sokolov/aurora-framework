<?php
/*
 * @copyright Copyright (c) 2017, Afterlogic Corp.
 * @license AGPL-3.0 or Afterlogic Software License
 *
 * This code is licensed under AGPLv3 license or Afterlogic Software License
 * if commercial version of the product was purchased.
 * For full statements of the licenses see LICENSE-AFTERLOGIC and LICENSE-AGPL3 files.
 */

/**
 * @internal
 * 
 * @package EAV
 * @subpackage Storages
 */

namespace Aurora\System\Managers\Eav\Storages\Db;

class Storage extends \Aurora\System\Managers\Eav\Storages\Storage
{
	/**
	 * @var CDbStorage $oConnection
	 */
	protected $oConnection;

	/**
	 * @var CApiEavCommandCreatorMySQL|CApiEavCommandCreatorPostgreSQL
	 */
	protected $oCommandCreator;

	/**
	 * 
	 * @param \Aurora\System\Managers\AbstractManager $oManager
	 */
	public function __construct(\Aurora\System\Managers\AbstractManager &$oManager)
	{
		parent::__construct($oManager);

		$this->oConnection =& $this->oManager->GetConnection();
		$this->oCommandCreator = new CommandCreator\MySQL();
	}

	/**
	 * 
	 * @param type $mIdOrUUID
	 * @return type
	 */
	public function isEntityExists($mIdOrUUID)
	{
		$bResult = false;
		
		if ($this->oConnection->Execute(
				$this->oCommandCreator->isEntityExists($mIdOrUUID)
			)
		)
		{
			$oRow = $this->oConnection->GetNextRecord();
			if ($oRow)
			{
				$bResult = 0 < (int) $oRow->entities_count;
			}

			$this->oConnection->FreeResult();
		}
		$this->throwDbExceptionIfExist();
		return $bResult;
	}	
	
	/**
	 * 
	 * @param type $sModule
	 * @param type $sType
	 * @param type $sUUID
	 * @return type
	 */
	public function createEntity($sModule, $sType, $sUUID)
	{
		$bResult = false;
		if ($this->oConnection->Execute(
				$this->oCommandCreator->createEntity($sModule, $sType, $sUUID)
			)
		)
		{
			$bResult = $this->oConnection->GetLastInsertId();
		}

		$this->throwDbExceptionIfExist();
		return $bResult;
	}
	
	/**
	 * 
	 * @param type $mIdOrUUID
	 * @return type
	 */
	public function getEntity($mIdOrUUID)
	{
		$oEntity = null;
		if ($this->oConnection->Execute(
				$this->oCommandCreator->getEntity($mIdOrUUID)
			)
		)
		{
			while (false !== ($oRow = $this->oConnection->GetNextRecord()))
			{
				if (!isset($oEntity))
				{
					$oEntity = \Aurora\System\EAV\Entity::createInstance($oRow->entity_type, $oRow->entity_module);
					
				}

				if (isset($oEntity))
				{
					$oEntity->EntityId = (int) $oRow->entity_id;
					$oEntity->UUID = isset($oRow->entity_uuid) ? $oRow->entity_uuid : '';

					if (isset($oRow->attr_name) && !in_array(strtolower($oRow->attr_name), \Aurora\System\EAV\Entity::$aReadOnlyAttributes))
					{
						$mValue = $oRow->attr_value;
						$bEncrypt = $oEntity->isEncryptedAttribute($oRow->attr_name);
						$oAttribute = \Aurora\System\EAV\Attribute::createInstance(
							$oRow->attr_name, 
							$mValue, 
							$oRow->attr_type, 
							$bEncrypt, 
							$oEntity->EntityId
						);
						$oAttribute->Encrypted = $bEncrypt;
						$oEntity->{$oRow->attr_name} = $oAttribute;
					}
				}
			}			
			$this->oConnection->FreeResult();
		}

		$this->throwDbExceptionIfExist();
		return $oEntity;
	}	

	public function getTypes()
	{
		$mResult = false;
		if ($this->oConnection->Execute(
				$this->oCommandCreator->getTypes()
			)
		)
		{
			$oRow = null;
			$mResult = array();
			while (false !== ($oRow = $this->oConnection->GetNextRecord()))
			{
				$mResult[] = $oRow->entity_type;
			}
		}
		$this->throwDbExceptionIfExist();
		return $mResult;
	}	
	
	/**
	 * 
	 * @param type $sType
	 * @param type $aWhere
	 * @param type $aIds
	 * @return type
	 */
	public function getEntitiesCount($sType, $aWhere = array(), $aIds = array())
	{
		$mResult = 0;
		if ($this->oConnection->Execute(
				$this->oCommandCreator->getEntitiesCount($sType, $aWhere, $aIds)
			)
		)
		{
			while (false !== ($oRow = $this->oConnection->GetNextRecord()))
			{
				$mResult = $oRow->entities_count;
			}			
			$this->oConnection->FreeResult();
		}

		$this->throwDbExceptionIfExist();
		return $mResult;
	}
	
	/**
	 * 
	 * @param type $sType
	 * @param type $aViewAttrs
	 * @param type $iOffset
	 * @param type $iLimit
	 * @param type $aSearchAttrs
	 * @param type $mOrderBy
	 * @param type $iSortOrder
	 * @param type $aIdsOrUUIDs
	 * @return \Aurora\System\EAV\Entity
	 */
	public function getEntities($sType, $aViewAttrs = array(), $iOffset = 0, $iLimit = 20, $aSearchAttrs = array(), $mOrderBy = array(), $iSortOrder = \Aurora\System\Enums\SortOrder::ASC, $aIdsOrUUIDs = array())
	{
		$mResult = false;
		
		if ($aViewAttrs === null)
		{
			$aViewAttrs = array();
		}
		else if (count($aViewAttrs) === 0)
		{
			$this->oConnection->Execute(
				$this->oCommandCreator->getAttributesNamesByEntityType($sType)
			);
			while (false !== ($oRow = $this->oConnection->GetNextRecord()))
			{
				$aViewAttrs[] = $oRow->name;
			}
			$this->oConnection->FreeResult();
		}		
		
		$this->oConnection->Execute("set sort_buffer_size=1024*1024"); // request for \Aurora\Modules\Contacts\Classes\Contact objects were failed with "Memory allocation error: 1038 Out of sort memory, consider increasing server sort buffer size"
		if ($this->oConnection->Execute(
				$this->oCommandCreator->getEntities(
					$sType, 
					$aViewAttrs, 
					$iOffset, 
					$iLimit, 
					$aSearchAttrs, 
					$mOrderBy, 
					$iSortOrder, 
					$aIdsOrUUIDs
				)
			)
		)
		{
			$oRow = null;
			$mResult = array();
			while (false !== ($oRow = $this->oConnection->GetNextRecord()))
			{
				if (class_exists($sType))
				{
					$oEntity = \Aurora\System\EAV\Entity::createInstance($sType);
				}
				else
				{
					$oEntity = new \Aurora\System\EAV\Entity($sType);
				}
				$oEntity->EntityId = (int) $oRow->entity_id;
				$oEntity->UUID = $oRow->entity_uuid;
				$oEntity->setModule($oRow->entity_module);

				foreach (get_object_vars($oRow) as $sKey => $mValue)
				{
					
					if (strrpos($sKey, 'attr_', -5) !== false)
					{
						$sAttrKey = substr($sKey, 5);
						if (!in_array(strtolower($sAttrKey), \Aurora\System\EAV\Entity::$aReadOnlyAttributes))
						{
							$bIsEncrypted = $oEntity->isEncryptedAttribute($sAttrKey);
							$oAttribute = \Aurora\System\EAV\Attribute::createInstance(
								$sAttrKey, 
								$mValue, 
								$oEntity->getType($sAttrKey), 
								$bIsEncrypted, 
								$oEntity->EntityId
							);
							$oAttribute->Encrypted = $bIsEncrypted;
							$oEntity->{$sAttrKey} = $oAttribute;
						}
					}
				}
				$mResult[] = $oEntity;
			}
			$this->oConnection->FreeResult();
		}
		$this->throwDbExceptionIfExist();
		return $mResult;
	}	

	/**
	 * @return bool
	 */
	public function deleteEntity($mIdOrUUID)
	{
		$bResult = $this->oConnection->Execute(
			$this->oCommandCreator->deleteEntity($mIdOrUUID)
		);
		$this->throwDbExceptionIfExist();
		return $bResult;
	}

	/**
	 * @return bool
	 */
	public function deleteEntities($aIdsOrUUIDs)
	{
		$bResult = $this->oConnection->Execute(
			$this->oCommandCreator->deleteEntities($aIdsOrUUIDs)
		);
		$this->throwDbExceptionIfExist();
		return $bResult;
	}

	/**
	 */
	public function setAttributes($aEntitiesIds, $aAttributes)
	{
		$aAttributesByTypes = array();
		foreach ($aAttributes as $oAttribute)
		{
			$aAttributesByTypes[$oAttribute->Type][] = $oAttribute;
		}
		
		foreach ($aAttributesByTypes as $sType => $aAttributes)
		{
			$this->oConnection->Execute(
				$this->oCommandCreator->setAttributes($aEntitiesIds, $aAttributes, $sType)
			);
		}
		$this->throwDbExceptionIfExist();
		return true;
	}	
	
	/**
	 * @return bool
	 */
	public function getAttributesNamesByEntityType($sEntityTypes)
	{
		$bResult = $this->oConnection->Execute($this->oCommandCreator->getAttributesNamesByEntityType($sEntityTypes));
		$this->throwDbExceptionIfExist();
		return $bResult;
	}

	public function testConnection()
	{
		return $this->oConnection->Connect();
	}
}
