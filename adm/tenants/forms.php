<button data-bind="click: reset" class="btn btn-default">Reset</button>
<fieldset data-bind="with: selectedItem">
	<label>Edit item</label>
	<form method="POST" action="<?php echo $sBaseUrl; ?>">
		<input type="hidden" name="manager" value="tenants"/>
		<input type="hidden" name="action" value="update"/>

		<div class="form-group">
			<label>Id</label>
			<input name="id" readonly="true" type="text" data-bind="textInput: id;" class="form-control" />
		</div>
		<div class="form-group">
			<label>Name</label>
			<input name="name" data-bind="textInput: name" class="form-control" />
		</div>
		<div class="form-group">
			<label>Login</label>
			<input name="login" data-bind="textInput: login" class="form-control" />
		</div>
		<div class="form-group">
			<label>Description</label>
			<input name="description" data-bind="textInput: description" class="form-control" />
		</div>
		<div class="form-group">
			<label>Channel Id</label>
			<input name="channel_id" data-bind="textInput: channel_id" class="form-control" />
		</div>

		<input type="submit" value="Update" class="btn btn-primary" />
	</form>
	<form method="POST" action="<?php echo $sBaseUrl; ?>">
		<input type="hidden" name="manager" value="tenants"/>
		<input type="hidden" name="action" value="delete"/>
		<div class="form-group">
			<label>Tenant id</label>
			<input name="id" readonly="true" type="text" data-bind="textInput: id;" class="form-control" />
		</div>

		<input type="submit" value="Delete" class="btn btn-danger" />
	</form>
	<form method="POST" action="<?php echo $sBaseUrl; ?>">
		<input type="hidden" name="manager" value="tenants"/>
		<input type="hidden" name="action" value="build"/>
		<div class="form-group">
			<label>Tenant id</label>
			<input name="id" readonly="true" type="text" data-bind="textInput: id;" class="form-control" />
			<input name="name" readonly="true" type="text" data-bind="textInput: name;" class="form-control" />
		</div>

		<input type="submit" value="Build CSS" class="btn btn-danger" />
	</form>
	
</fieldset>
<fieldset data-bind="if: !selectedItem()">
	<label>Create item</label>
	<form method="POST" action="<?php echo $sBaseUrl; ?>">
		<input type="hidden" name="manager" value="tenants"/>
		<input type="hidden" name="action" value="create"/>

		<div class="form-group">
			<label>Channel id</label>
			<input name="channel_id" class="form-control" />
		</div>
		<div class="form-group">
			<label>Name</label>
			<input name="name" class="form-control" />
		</div>
		<div class="form-group">
			<label>Description</label>
			<input name="description" class="form-control" />
		</div>
		<div class="form-group">
			<label>Password</label>
			<input name="password" class="form-control" />
		</div>

		<input type="submit" value="Create" class="btn btn-primary" />
	</form>
</fieldset>