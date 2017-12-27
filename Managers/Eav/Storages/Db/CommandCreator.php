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

class CommandCreator extends \Aurora\System\Db\AbstractCommandCreator
{
	/**
	 * @return string
	 */
	public function isEntityExists($mIdOrUUID)
	{
		$sWhere = is_int($mIdOrUUID) ? 
				sprintf('id = %d', $mIdOrUUID) : 
					sprintf('uuid = %s', $this->escapeString($mIdOrUUID));

		return sprintf(
			'SELECT COUNT(id) as entities_count '
			. 'FROM %seav_entities WHERE %s', 
			$this->prefix(), $sWhere
		);
	}

	/**
	 * @return string
	 */
	public function createEntity($sModule, $sType, $sUUID = '', $sParentUUID = '')
	{
		return sprintf(
			'INSERT INTO %seav_entities ( %s, %s, %s, %s ) '
			. 'VALUES ( %s, %s, %s, %s )', 
			$this->prefix(),
			$this->escapeColumn('uuid'), 
			$this->escapeColumn('module_name'), 
			$this->escapeColumn('entity_type'), 
			$this->escapeColumn('parent_uuid'), 
			empty($sUUID) ? 'UUID()' : $this->escapeString($sUUID), 
			$this->escapeString($sModule),
			$this->escapeString($sType),
			$this->escapeString($sParentUUID)
		);
	}
	
	/**
	 * @param $mIdOrUUID
	 *
	 * @return string
	 */
	public function deleteEntity($mIdOrUUID)
	{
		$sWhere = is_int($mIdOrUUID) ? 
				sprintf('id = %d', $mIdOrUUID) : 
					sprintf('uuid = %s', $this->escapeString($mIdOrUUID));

		return sprintf(
			'DELETE FROM %seav_entities WHERE %s', 
			$this->prefix(), $sWhere);
	}	
	
	/**
	 * @param $aIdsOrUUIDs
	 *
	 * @return string
	 */
	public function deleteEntities($aIdsOrUUIDs)
	{
		$sResult = '';
		if (count($aIdsOrUUIDs) > 0)
		{
			$sIdOrUUID = 'id';
			if(!is_int($aIdsOrUUIDs[0]))
			{
				$sIdOrUUID = 'uuid';
				$aIdsOrUUIDs = array_map(
					function ($mValue) {
						return $this->escapeString($mValue);
					}, 
					$aIdsOrUUIDs
				);
			}
			$sResult = sprintf(
				'DELETE FROM %seav_entities WHERE %s IN (' . implode(',', $aIdsOrUUIDs) . ')', 
				$this->prefix(), $sIdOrUUID
			);
		}
		
		return $sResult;
	}	
	
	/**
	 * 
	 * @param int|string $mIdOrUUID
	 * @return string
	 */
	public function getEntity($mIdOrUUID)
	{
		$sWhere = is_int($mIdOrUUID) ? 
				sprintf('entities.id = %d', $mIdOrUUID) : 
					sprintf('entities.uuid = %s', $this->escapeString($mIdOrUUID));
		
		$sSubSql = "
(SELECT 	   
	entities.id as entity_id, 
	entities.uuid as entity_uuid, 
	entities.parent_uuid as parent_uuid, 
	entities.entity_type, 
	entities.module_name as entity_module,
	attrs.name as attr_name,
    attrs.value as attr_value,
	%s as attr_type
FROM %seav_entities as entities
	  INNER JOIN %seav_attributes_%s as attrs ON entities.id = attrs.id_entity
WHERE %s)
";
		
		foreach (\Aurora\System\EAV\Entity::getTypes() as $sSqlType)
		{
			$aSql[] = sprintf($sSubSql, $this->escapeString($sSqlType), $this->prefix(), $this->prefix(), $sSqlType, $sWhere);
		}
		$sSql = implode("UNION
", $aSql);

		return $sSql;
	}

	/**
	 * @return string
	 */
	public function getTypes()
	{
		return sprintf('
SELECT DISTINCT entity_type FROM %seav_entities', 
			$this->prefix()
		);
	}
			
	public function prepareWhere($aWhere, $oEntity, &$aWhereAttributes, $sOperator = 'AND')
	{
		$aResultOperations = array();
		foreach ($aWhere as $sKey => $mValue)
		{
			if (strpos($sKey, '$') !== false)
			{
				list(,$sKey) = explode('$', $sKey);
				$aResultOperations[] = $this->prepareWhere($mValue, $oEntity, $aWhereAttributes, $sKey);
			}
			else
			{
				$mResultValue = null;
				$mResultOperator = '=';
				if (is_array($mValue))
				{
					if (0 < count($mValue))
					{
						$mResultValue = $mValue[0];
						$mResultOperator = $mValue[1];
					}
				}
				else
				{
					$mResultValue = $mValue;
				}
				if (isset($mResultValue))
				{
					if (strpos($sKey, '@') !== false)
					{
						list(,$sKey) = explode('@', $sKey);
					}
					
					if (!in_array($sKey, $aWhereAttributes))
					{
						$aWhereAttributes[] = $sKey;
					}
					if ($oEntity->isEncryptedAttribute($sKey))
					{
						$mResultValue = \Aurora\System\Utils::EncryptValue($mResultValue);
					}
					$bIsInOperator = false;
					if (strtolower($mResultOperator) === 'in' || strtolower($mResultOperator) === 'not in'  
						&& is_array($mResultValue))
					{
						$bIsInOperator = true;
						$mResultValue = array_map(
							function ($mValue) use ($oEntity, $sKey) {
								return $oEntity->isStringAttribute($sKey) ? $this->escapeString($mValue) : $mValue;
							}, 
							$mResultValue
						);
						$mResultValue = '(' . implode(', ', $mResultValue)  . ')';
						$sValueFormat = "%s";
					}
					else if (strtolower($mResultOperator) === 'is' || strtolower($mResultOperator) === 'is not'  )
					{
						$bIsInOperator = true;
						$sValueFormat = "%s";
					}
					else
					{
						$sValueFormat = $oEntity->isStringAttribute($sKey) ? "%s" : "%d";
					}
					$sResultOperation = sprintf(
						"`attr_%s` %s " . $sValueFormat, 
						$sKey, 
						$mResultOperator, 
						($oEntity->isStringAttribute($sKey) && !$bIsInOperator) ? $this->escapeString($mResultValue) : $mResultValue
					);
/*
					if ($oEntity->isDefaultValue($sKey, $mResultValue))
					{
						$sResultOperation .= sprintf(
						" OR `attr_%s` IS NULL", 
						$sKey, 
						$mResultOperator);
					}
 * 
 */
					$aResultOperations[] = $sResultOperation;
				}
			}
		}
		return sprintf(
			count($aResultOperations) > 1 ? '(%s)' : '%s', 
			implode(' ' . $sOperator . ' ', $aResultOperations)
		);
	}
	
	/**
	 * 
	 * @param type $sType
	 * @param type $aWhere
	 * @param type $aIdsOrUUIDs
	 * @return type
	 */
	public function getEntitiesCount($sType, $aWhere = array(), $aIdsOrUUIDs = array())
	{
		return $this->getEntities(
			$sType, 
			array('UUID'), 
			0, 
			0, 
			$aWhere, 
			null, 
			\Aurora\System\Enums\SortOrder::ASC, 
			$aIdsOrUUIDs, 
			true
		);
	}

	/**
	 * 
	 * @param type $sEntityType
	 * @param type $aViewAttributes
	 * @param type $iOffset
	 * @param type $iLimit
	 * @param type $aWhere
	 * @param string|array $mSortAttributes
	 * @param type $iSortOrder
	 * @param type $aIdsOrUUIDs
	 * @param type $bCount
	 * @return type
	 * 
		$aWhere = [
		   '$OR' => [
			   '$AND' => [
				   'IdUser' => [
					   1,
					   '='
				   ],
				   'Storage' => [
					   'personal',
					   '='
				   ]
			   ],
			   'Storage' => [
				   'global',
				   '='
			   ]
		   ]
	   ];
	 */	
	public function getEntities($sEntityType, $aViewAttributes = array(), 
			$iOffset = 0, $iLimit = 0, $aWhere = array(), $mSortAttributes = array(), 
			$iSortOrder = \Aurora\System\Enums\SortOrder::ASC, $aIdsOrUUIDs = array(), $bCount = false)
	{
		$sViewAttributes = "";
		$sMaxViewAttributes = "";
		$sJoinAttrbutes = "";
		$sResultWhere = "";
		$sResultSort = "";
		$sLimit = "";
		$sOffset = "";
		
		$sIdsOrUUIDsWhere = "";
		
		$oEntity = \Aurora\System\EAV\Entity::createInstance($sEntityType);
		if ($oEntity instanceof $sEntityType)
		{
			$aResultViewAttributes = array();
			$aResultMaxAttributes = array();
			$aJoinAttributes = array();
			
			if ($aViewAttributes === null)
			{
				$aViewAttributes = array();
			}
			if (!is_array($mSortAttributes) && !empty($mSortAttributes))
			{
				$mSortAttributes = array($mSortAttributes);
			}
			
			if (is_array($mSortAttributes))
			{
				$aViewAttributes = array_merge($aViewAttributes, $mSortAttributes);
				$mSortAttributes = array_map(function($sValue){
					return $this->escapeColumn(
						sprintf("attr_%s", $sValue)
					);
				}, $mSortAttributes);
				$mSortAttributes[] = 'attr_EntityId';

				$mSortAttributes = array_map(function ($sSortField) use ($iSortOrder) {
					return $sSortField . ' ' . ($iSortOrder === \Aurora\System\Enums\SortOrder::ASC ? "ASC" : "DESC");
				}, $mSortAttributes);

				$sResultSort = " ORDER BY " . implode(', ', $mSortAttributes) . "";
			}
			
			$aWhereAttrs = array();
			if (0 < count($aWhere))
			{
				$sResultWhere = ' AND ' . $this->prepareWhere($aWhere, $oEntity, $aWhereAttrs);
			}
			$aViewAttributes = array_unique(
				array_merge(
					$aViewAttributes, 
					$aWhereAttrs
				)
			);

			$aViewAttributesByTypes = [];
			foreach ($aViewAttributes as $sAttribute)
			{
				if (!$oEntity->isSystemAttribute($sAttribute))
				{
					$sType = $oEntity->getType($sAttribute);
					$aViewAttributesByTypes[$sType][] = $sAttribute;
				}
			}
			
			foreach ($aViewAttributesByTypes as $sType => $aAttributes)
			{
				$aJoinAttributesTmp = array();
				foreach ($aAttributes as $sAttribute)
				{
					$aResultViewAttributes[$sAttribute] = sprintf(
							"				
			CASE WHEN %seav_attributes_%s.name = '%s'
				THEN %seav_attributes_%s.`value` 
			END as `attr_%s`", 
							$this->prefix(),
							$sType,
							$sAttribute,
							$this->prefix(),
							$sType,
							$sAttribute
					);
					$aResultMaxAttributes[$sAttribute] = sprintf(
							"MAX(`attr_%s`) as `attr_%s`
	", 
							$sAttribute,
							$sAttribute
					);
					
					$aJoinAttributesTmp[$sAttribute] = sprintf(
							"%seav_attributes_%s.name = '%s'",
							$this->prefix(),
							$sType,
							$sAttribute
					);
					
				}
				
				$sJoinAttributesTmp = implode(' OR ', $aJoinAttributesTmp);
				
				$aJoinAttributes[$sType] = sprintf(
						"
			LEFT JOIN %seav_attributes_%s
			  ON (%s)
				AND %seav_attributes_%s.id_entity = entities.id",
						$this->prefix(),
						$sType,
						$sJoinAttributesTmp,
						$this->prefix(),
						$sType
				);
			}
			if (0 < count($aResultViewAttributes))
			{
				$sViewAttributes = ', ' . implode(', ', $aResultViewAttributes);

				$sMaxViewAttributes = ', ' . implode(', ', $aResultMaxAttributes);
				$sJoinAttrbutes = implode(' ', $aJoinAttributes);
			}
			if (0 < count($aIdsOrUUIDs))
			{
				$aIds = array();
				$aUUIDs = array();
				foreach ($aIdsOrUUIDs as $mIdOrUUID)
				{
					if (!is_numeric($mIdOrUUID))
					{
						$aUUIDs[] = $this->escapeString($mIdOrUUID);
					}
					else
					{
						$aIds[] = $mIdOrUUID;
					}
				}
				
				$bHasUUIDs = false;
				if (count($aUUIDs) > 0)
				{
					$bHasUUIDs = true;
					$sIdsOrUUIDsWhere .= sprintf(
						' AND entities.uuid IN (%s)', 
						implode(',', $aUUIDs)
					);
				}
				if (count($aIds) > 0)
				{
					$sIdsOrUUIDsWhere .= sprintf(
						' %s entities.id IN (%s)', 
						$bHasUUIDs ? 'OR' : 'AND',
						implode(',', $aIds)
					);
				}
			}
			
			if ($iLimit > 0)
			{
				$sLimit = sprintf("LIMIT %d", $iLimit);
				$sOffset = sprintf("OFFSET %d", $iOffset);
			}
		}		
		
		$sSql = sprintf("
SELECT * FROM (SELECT attr_EntityId, attr_UUID, attr_ModuleName, attr_ParentUUID
	%s #1
	FROM (SELECT 
			entities.id as attr_EntityId, 
			entities.uuid as attr_UUID, 
			entities.parent_uuid as attr_ParentUUID, 
			entities.entity_type, 
			entities.module_name as attr_ModuleName
			# fields
			%s #2
			# ------
		FROM %seav_entities as entities #3
			# fields
			%s #4
			# ------

		WHERE entities.entity_type = %s #5 ENTITY TYPE
		%s #6 WHERE
		) AS S1
		GROUP BY attr_EntityId 
    ) as S2
	WHERE 1=1 %s #7 WHERE
	%s #8 SORT
	%s #9 LIMIT
	%s #10 OFFSET", 
			$sMaxViewAttributes,
			$sViewAttributes, 
			$this->prefix(),
			$sJoinAttrbutes, 
			$this->escapeString($sEntityType), 
			$sIdsOrUUIDsWhere,
			$sResultWhere,
			$sResultSort,
			$sLimit,
			$sOffset
		);
		
		if ($bCount)
		{
			$sSql = sprintf("
SELECT count(attr_EntityId) AS entities_count FROM (
%s
) as tmp", $sSql);
		}
		
		\Aurora\System\Api::Log($sSql, \Aurora\System\Enums\LogLevel::Full, "sql-");
		
		return $sSql;
	}	
	
	/**
	 * @param array $aEntities
	 * @param array $aAttributes
	 *
	 * @return string
	 */
	public function setAttributes($aEntities, $aAttributes, $sType)
	{
		$sSql = '';
		$aSql = array();
		$aSqlDelete = array();
		$aValues = array();
		foreach ($aEntities as $oEntity)
		{
			$iEntityId = $oEntity->EntityId;
			foreach ($aAttributes as $oAttribute)
			{
				if ($oAttribute instanceof \Aurora\System\EAV\Attribute && !$oEntity->isSystemAttribute($oAttribute->Name))
				{
					if (!$oEntity->isDefaultValue($oAttribute->Name, $oAttribute->Value) || ($oEntity->isOverridedAttribute($oAttribute->Name)) || (!$oAttribute->Inherited))
					{
						if ($oAttribute->IsEncrypt && !$oAttribute->Encrypted)
						{
							$oAttribute->Encrypt();
						}
						$mValue = $oAttribute->Value;
						$sSqlValue = $oAttribute->needToEscape() ? $this->escapeString($mValue) : $mValue;
						$sSqlValueType = $oAttribute->getValueFormat();

						$aValues[] = sprintf('	(%d, %s, ' . $sSqlValueType . ')',
							$iEntityId,
							$this->escapeString($oAttribute->Name),
							$sSqlValue
						);
					}
					else
					{
						$aSqlDelete[] = sprintf(
							'id_entity = %d AND name = %s',
							$iEntityId,
							$this->escapeString($oAttribute->Name)
						);
					}
				}
			}
		}
		if (count($aValues) > 0)
		{
			$sValues = implode(",\r\n", $aValues);

			$aSql[] = $sSql . sprintf('
INSERT INTO %seav_attributes_%s 
	(%s, %s, %s)
VALUES 
%s
ON DUPLICATE KEY UPDATE 
	%s=VALUES(%s),
	%s=VALUES(%s),
	%s=VALUES(%s);
', 
				$this->prefix(), 
				$sType, 
				$this->escapeColumn('id_entity'), 
				$this->escapeColumn('name'),
				$this->escapeColumn('value'),
				$sValues,
				$this->escapeColumn('id_entity'), $this->escapeColumn('id_entity'), 
				$this->escapeColumn('name'), $this->escapeColumn('name'),
				$this->escapeColumn('value'), $this->escapeColumn('value')
			);
		}
		if (count($aSqlDelete) > 0)
		{
			array_unshift($aSql, sprintf(
				'DELETE FROM %seav_attributes_%s WHERE ' . implode(" OR ", $aSqlDelete) . ";",
				$this->prefix(), 
				$sType
			));
		}
		return $aSql;
	}	
	
	public function deleteAttribute($sType, $iEntityId, $sAttribute)
	{
		return sprintf(
			'DELETE FROM %seav_attributes_%s WHERE id_entity = %d AND name = %s', 
			$this->prefix(), $sType, $iEntityId, $this->escapeString($sAttribute));		
	}
	
	public function getAttributesNamesByEntityType($sEntityType)
	{
		$sSubSql = "
(SELECT DISTINCT name FROM %seav_attributes_%s as attrs, %seav_entities as entities
	WHERE entity_type = %s AND entities.id = attrs.id_entity)
";
		
		foreach (\Aurora\System\EAV\Entity::getTypes() as $sSqlType)
		{
			$aSql[] = sprintf($sSubSql, $this->prefix(), $sSqlType, $this->prefix(), $this->escapeString($sEntityType));
		}
		$sSql = implode("UNION
", $aSql);

		return $sSql;
	}
}

