<?php
/*
 * @copyright Copyright (c) 2017, Afterlogic Corp.
 * @license AGPL-3.0
 *
 * This code is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License, version 3,
 * as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License, version 3,
 * along with this program.  If not, see <http://www.gnu.org/licenses/>
 */

include_once '../system/autoload.php';


$aArguments = getopt("m:n:v:");

if (isset($aArguments['m'], $aArguments['n'], $aArguments['v']))
{
	$sModuleName = $aArguments['m'];
	$sConfigName = $aArguments['n'];
	$mConfigValue = $aArguments['v'];

	\Aurora\System\Api::Init();
	$oModuleManager = \Aurora\System\Api::GetModuleManager();

	$mValue = $oModuleManager->getModuleConfigValue($sModuleName, $sConfigName, null);
	if ($mValue !== null)
	{
		$oModuleManager->setModuleConfigValue($sModuleName, $sConfigName, $mConfigValue);
		$oModuleManager->saveModuleConfigValue($sModuleName);
	}
	else
	{
		echo 'Invalid \'' . $sConfigName . '\'';
	}
}
else
{
	echo 'Invalid input parameters';
}